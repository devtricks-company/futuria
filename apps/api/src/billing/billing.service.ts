import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import {
  type ApiErrorBody,
  type BillingUrlDto,
  type CheckoutRequest,
  type PlanId,
  parsePriceLookupKey,
  priceLookupKey,
} from '@futuria/shared';
import type { AuthContext } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { User, type UserSubscription } from '../users/user.schema.js';
import { STRIPE } from './stripe.provider.js';

/** Subscription statuses that keep the paid plan (past_due: Stripe is still retrying payment). */
const LIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);
const PRICE_CACHE_MS = 10 * 60 * 1000;

function error(statusCode: number, name: string, code: string, message: string): ApiErrorBody {
  return { statusCode, error: name, code, message };
}

const billingDisabled = () =>
  new ServiceUnavailableException(
    error(
      503,
      'Service Unavailable',
      'billing_disabled',
      'Billing is not configured on this server.',
    ),
  );

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

const fromUnix = (seconds: number | null | undefined): Date | null =>
  typeof seconds === 'number' ? new Date(seconds * 1000) : null;

/** Our plan for a Stripe subscription (by its price lookup key), or null for foreign prices. */
function planOf(subscription: Stripe.Subscription): PlanId | null {
  return parsePriceLookupKey(subscription.items.data[0]?.price.lookup_key)?.plan ?? null;
}

/**
 * Stripe Checkout, Customer Portal and the subscription → plan sync.
 *
 * The plan is never taken from the client or from an event payload: every sync re-reads the
 * customer's subscriptions from Stripe, so webhooks can arrive late, twice or out of order.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly prices = new Map<string, { id: string; at: number }>();

  constructor(
    @Inject(STRIPE) private readonly stripe: Stripe | null,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get enabled(): boolean {
    return this.stripe !== null;
  }

  /** Start a Stripe Checkout session for a subscription; returns the URL to redirect to. */
  async checkout(auth: AuthContext, request: CheckoutRequest): Promise<BillingUrlDto> {
    const stripe = this.client();
    const user = await this.users.findById(auth.userId).orFail().lean().exec();
    if (user.subscription && LIVE_STATUSES.has(user.subscription.status)) {
      throw new ConflictException(
        error(
          409,
          'Conflict',
          'already_subscribed',
          'You already have a subscription. Change or cancel it in the billing portal.',
        ),
      );
    }
    const customer = await this.customerFor(stripe, auth.userId, user.stripeCustomerId);
    const price = await this.priceId(stripe, priceLookupKey(request.plan, request.interval));
    const session = await this.call(() =>
      stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        client_reference_id: auth.userId,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: { metadata: { userId: auth.userId } },
        success_url: `${this.webOrigin()}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.webOrigin()}/settings/billing?checkout=cancelled`,
      }),
    );
    if (!session.url) throw this.stripeUnavailable();
    return { url: session.url };
  }

  /** A Customer Portal session (change plan, cancel, payment method, invoices). */
  async portal(auth: AuthContext): Promise<BillingUrlDto> {
    const stripe = this.client();
    const user = await this.users.findById(auth.userId).orFail().lean().exec();
    if (!user.stripeCustomerId) {
      throw new ConflictException(
        error(409, 'Conflict', 'no_billing_account', 'There is no subscription to manage yet.'),
      );
    }
    const session = await this.call(() =>
      stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId!,
        return_url: `${this.webOrigin()}/settings/billing`,
      }),
    );
    return { url: session.url };
  }

  /**
   * Called by the success page after Checkout: sync now instead of waiting for the webhook.
   * Only the user who started the session can sync it.
   */
  async syncCheckoutSession(auth: AuthContext, sessionId: string): Promise<void> {
    const stripe = this.client();
    const session = await this.call(() => stripe.checkout.sessions.retrieve(sessionId), true);
    const customer = idOf(session?.customer);
    if (!session || session.client_reference_id !== auth.userId || !customer) {
      throw new NotFoundException(
        error(404, 'Not Found', 'not_found', 'Checkout session not found'),
      );
    }
    await this.linkCustomer(auth.userId, customer);
    await this.syncCustomer(customer);
  }

  /**
   * Verify and handle a Stripe webhook. Unknown events are acknowledged and ignored. Keep
   * WEBHOOK_EVENTS (webhook-events.ts, what `stripe:listen` forwards) in step with the cases.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!this.enabled) throw billingDisabled();
    let event: Stripe.Event;
    try {
      if (!rawBody || !signature) throw new Error('missing body or signature');
      event = Stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true })!,
      );
    } catch (cause) {
      this.logger.warn(`Rejected webhook: ${(cause as Error).message}`);
      throw new BadRequestException(
        error(400, 'Bad Request', 'invalid_signature', 'Invalid Stripe signature'),
      );
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customer = idOf(session.customer);
        if (!customer) return;
        if (session.client_reference_id) {
          await this.linkCustomer(session.client_reference_id, customer);
        }
        await this.syncCustomer(customer);
        return;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const customer = idOf(event.data.object.customer);
        if (customer) await this.syncCustomer(customer);
        return;
      }
      case 'invoice.paid': {
        const customer = idOf(event.data.object.customer);
        if (customer) await this.syncCustomer(customer);
        return;
      }
      default:
        this.logger.debug(`Ignoring webhook ${event.type}`);
    }
  }

  /**
   * Re-read the customer's subscriptions from Stripe and store the resulting plan. A new billing
   * period (a renewal, or a first subscription) starts a fresh simulation quota.
   */
  async syncCustomer(customerId: string): Promise<void> {
    const stripe = this.client();
    const user = await this.userForCustomer(stripe, customerId);
    if (!user) {
      this.logger.warn(`No user for Stripe customer ${customerId}; ignoring.`);
      return;
    }

    const list = await this.call(() =>
      stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 }),
    );
    const ours = list.data.filter((s) => planOf(s) !== null).sort((a, b) => b.created - a.created);
    const live = ours.find((s) => LIVE_STATUSES.has(s.status)) ?? null;
    const current = live ?? ours[0] ?? null;
    const plan: PlanId = live ? planOf(live)! : 'free';

    let subscription: UserSubscription | null = null;
    let periodStart: Date | null = null;
    if (current) {
      const item = current.items.data[0]!;
      periodStart = fromUnix(item.current_period_start);
      subscription = {
        id: current.id,
        status: current.status,
        priceLookupKey: item.price.lookup_key,
        interval: parsePriceLookupKey(item.price.lookup_key)?.interval ?? null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: fromUnix(item.current_period_end),
        cancelAtPeriodEnd: current.cancel_at_period_end || current.cancel_at !== null,
      };
    }

    // A billing period we haven't seen (a first subscription, a renewal, a new subscription)
    // starts a fresh quota. A plan switch inside the same period keeps the usage.
    const previous = user.subscription;
    const newPeriod =
      live !== null &&
      periodStart !== null &&
      (previous?.id !== live.id ||
        previous.currentPeriodStart?.getTime() !== periodStart.getTime());
    let reset = false;
    if (newPeriod) {
      // Conditional on what we read, so a concurrent or repeated sync resets only once.
      const updated = await this.users
        .updateOne(
          {
            _id: user._id,
            'subscription.id': previous?.id ?? null,
            'subscription.currentPeriodStart': previous?.currentPeriodStart ?? null,
          },
          {
            $set: {
              plan,
              subscription,
              'usage.periodStart': periodStart,
              'usage.simulationsUsed': 0,
            },
          },
        )
        .exec();
      reset = updated.matchedCount === 1;
    }
    if (!reset) {
      await this.users.updateOne({ _id: user._id }, { $set: { plan, subscription } }).exec();
    }
    if (plan !== user.plan) {
      this.logger.log(`User ${String(user._id)}: plan ${user.plan} -> ${plan}`);
    }
  }

  private client(): Stripe {
    if (!this.stripe) throw billingDisabled();
    return this.stripe;
  }

  private webOrigin(): string {
    return this.config.get('WEB_ORIGINS', { infer: true })[0] ?? 'http://localhost:3000';
  }

  /** The user's Stripe customer, created on first checkout (idempotent per user). */
  private async customerFor(
    stripe: Stripe,
    userId: string,
    existing: string | null,
  ): Promise<string> {
    if (existing) return existing;
    const customer = await this.call(() =>
      stripe.customers.create(
        { metadata: { userId } },
        { idempotencyKey: `futuria-customer-${userId}` },
      ),
    );
    await this.linkCustomer(userId, customer.id);
    const user = await this.users.findById(userId).select({ stripeCustomerId: 1 }).lean().exec();
    return user?.stripeCustomerId ?? customer.id;
  }

  /** Remember the customer on the user (first link wins; never re-pointed). */
  private async linkCustomer(userId: string, customerId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    await this.users
      .updateOne(
        { _id: new Types.ObjectId(userId), stripeCustomerId: null },
        { $set: { stripeCustomerId: customerId } },
      )
      .exec();
  }

  private async userForCustomer(stripe: Stripe, customerId: string) {
    const linked = await this.users
      .findOne({ stripeCustomerId: customerId })
      .select({ plan: 1, subscription: 1 })
      .lean()
      .exec();
    if (linked) return linked;
    // A webhook can beat the link written at checkout: fall back to the customer's metadata.
    const customer = await this.call(() => stripe.customers.retrieve(customerId), true);
    const userId = customer && !customer.deleted ? customer.metadata.userId : undefined;
    if (!userId) return null;
    await this.linkCustomer(userId, customerId);
    return this.users
      .findOne({ stripeCustomerId: customerId })
      .select({ plan: 1, subscription: 1 })
      .lean()
      .exec();
  }

  private async priceId(stripe: Stripe, lookupKey: string): Promise<string> {
    const cached = this.prices.get(lookupKey);
    if (cached && Date.now() - cached.at < PRICE_CACHE_MS) return cached.id;
    const list = await this.call(() =>
      stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 }),
    );
    const price = list.data[0];
    if (!price) {
      this.logger.error(`No active Stripe price "${lookupKey}". Run stripe:setup.`);
      throw new ServiceUnavailableException(
        error(503, 'Service Unavailable', 'billing_misconfigured', 'This plan is not on sale yet.'),
      );
    }
    this.prices.set(lookupKey, { id: price.id, at: Date.now() });
    return price.id;
  }

  /** Run a Stripe call; network/API failures become 502 (missing objects: null if allowed). */
  private async call<T>(fn: () => Promise<T>, nullIfMissing?: false): Promise<T>;
  private async call<T>(fn: () => Promise<T>, nullIfMissing: true): Promise<T | null>;
  private async call<T>(fn: () => Promise<T>, nullIfMissing = false): Promise<T | null> {
    try {
      return await fn();
    } catch (cause) {
      if (cause instanceof Stripe.errors.StripeError) {
        if (nullIfMissing && cause.code === 'resource_missing') return null;
        this.logger.error(`Stripe ${cause.type}: ${cause.message}`);
        throw this.stripeUnavailable();
      }
      throw cause;
    }
  }

  private stripeUnavailable() {
    return new BadGatewayException(
      error(502, 'Bad Gateway', 'billing_unavailable', 'Billing is unavailable. Please try again.'),
    );
  }
}
