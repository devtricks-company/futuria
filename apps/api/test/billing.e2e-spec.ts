import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import Stripe from 'stripe';
import { SARA_MODEL, priceLookupKey } from '@futuria/shared';
import { STRIPE } from '../src/billing/stripe.provider.js';
import { closeTestApp, createTestApp, setPlan, usersModel } from './test-app.js';

/*
 * Billing with a fake Stripe client (no network): Checkout, the portal, and the webhook that
 * syncs the plan. Webhooks are signed for real with the test secret, so signature checks run.
 */
const WEBHOOK_SECRET = 'whsec_test_secret';
vi.hoisted(() => {
  process.env.BILLING_MODE = 'stripe';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
});

const DAY = 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);

interface FakeSubscription {
  id: string;
  customer: string;
  status: string;
  created: number;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  items: {
    data: {
      price: { id: string; lookup_key: string };
      current_period_start: number;
      current_period_end: number;
    }[];
  };
}

/** The slice of the Stripe API FUTURIA uses, kept in memory. */
function fakeStripe() {
  const customers = new Map<string, { id: string; metadata: Record<string, string> }>();
  const sessions = new Map<string, { id: string; customer: string; client_reference_id: string }>();
  const subscriptions: FakeSubscription[] = [];
  const missing = (message: string) =>
    new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      code: 'resource_missing',
      message,
    });

  const fake = {
    customers: {
      create: vi.fn(async (params: { metadata: Record<string, string> }) => {
        const customer = { id: `cus_${customers.size + 1}`, metadata: params.metadata };
        customers.set(customer.id, customer);
        return customer;
      }),
      retrieve: vi.fn(async (id: string) => {
        const customer = customers.get(id);
        if (!customer) throw missing(`No such customer: ${id}`);
        return { ...customer, deleted: undefined };
      }),
    },
    prices: {
      list: vi.fn(async (params: { lookup_keys: string[] }) => ({
        data: params.lookup_keys.map((key) => ({ id: `price_${key}`, lookup_key: key })),
      })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (params: { customer: string; client_reference_id: string }) => {
          const session = {
            id: `cs_test_${sessions.size + 1}`,
            customer: params.customer,
            client_reference_id: params.client_reference_id,
          };
          sessions.set(session.id, session);
          return { ...session, url: `https://checkout.stripe.test/${session.id}` };
        }),
        retrieve: vi.fn(async (id: string) => {
          const session = sessions.get(id);
          if (!session) throw missing(`No such checkout.session: ${id}`);
          return session;
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async (params: { customer: string }) => ({
          url: `https://billing.stripe.test/${params.customer}`,
        })),
      },
    },
    subscriptions: {
      list: vi.fn(async (params: { customer: string }) => ({
        data: subscriptions.filter((s) => s.customer === params.customer),
      })),
    },
  };

  /** What Stripe would do once Checkout completes (or the portal changes the plan). */
  const subscribe = (
    customer: string,
    plan: 'pro' | 'premium',
    interval: 'month' | 'year',
    periodStart = now(),
  ): FakeSubscription => {
    const key = priceLookupKey(plan, interval);
    const subscription: FakeSubscription = {
      id: `sub_${subscriptions.length + 1}`,
      customer,
      status: 'active',
      created: now() + subscriptions.length,
      cancel_at_period_end: false,
      cancel_at: null,
      items: {
        data: [
          {
            price: { id: `price_${key}`, lookup_key: key },
            current_period_start: periodStart,
            current_period_end: periodStart + (interval === 'year' ? 365 : 30) * DAY,
          },
        ],
      },
    };
    subscriptions.push(subscription);
    return subscription;
  };

  return { fake, customers, subscriptions, subscribe };
}

describe('Billing (e2e, fake Stripe)', () => {
  let app: INestApplication<App>;
  const stripe = fakeStripe();
  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-dev-user', user),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-dev-user', user),
  });

  const webhook = (type: string, object: object, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify({
      id: `evt_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type,
      created: now(),
      data: { object },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    return request(app.getHttpServer())
      .post('/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload);
  };

  const me = async (user: string) => (await as(user).get('/me').expect(200)).body;

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(STRIPE).useValue(stripe.fake));
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('reports billing as enabled', async () => {
    expect((await me('buyer')).billing).toEqual({ enabled: true, subscription: null });
    const health = await request(app.getHttpServer()).get('/health').expect(200);
    expect(health.body.billing).toBe('stripe');
  });

  it('starts Checkout with the plan price and one customer per user', async () => {
    const res = await as('buyer')
      .post('/billing/checkout')
      .send({ plan: 'pro', interval: 'month' })
      .expect(200);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_test_/);

    const { id: userId } = await me('buyer');
    expect(stripe.fake.customers.create).toHaveBeenCalledWith(
      { metadata: { userId } },
      { idempotencyKey: `futuria-customer-${userId}` },
    );
    expect(stripe.fake.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_1',
        client_reference_id: userId,
        line_items: [{ price: 'price_futuria_pro_month', quantity: 1 }],
        success_url: expect.stringContaining('/settings/billing?session_id={CHECKOUT_SESSION_ID}'),
      }),
    );
    const stored = await usersModel(app).findById(userId).lean();
    expect(stored!.stripeCustomerId).toBe('cus_1');

    await as('buyer').post('/billing/checkout').send({ plan: 'premium', interval: 'year' });
    expect(stripe.fake.customers.create).toHaveBeenCalledTimes(1);

    await as('buyer')
      .post('/billing/checkout')
      .send({ plan: 'business', interval: 'month' })
      .expect(400);
  });

  it('rejects webhooks with a bad signature', async () => {
    const res = await webhook('customer.subscription.updated', { customer: 'cus_1' }, 'whsec_x');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_signature');
    await request(app.getHttpServer()).post('/billing/webhook').send({}).expect(400);
  });

  it('upgrades the plan from the webhook and starts a fresh quota', async () => {
    const { id: userId } = await me('buyer');
    await setPlan(app, 'buyer', 'free', { simulationsUsed: 3 });
    const subscription = stripe.subscribe('cus_1', 'pro', 'month');

    await webhook('customer.subscription.created', subscription).expect(200);
    const after = await me('buyer');
    expect(after).toMatchObject({
      plan: 'pro',
      usage: { simulationsUsed: 0 },
      billing: {
        subscription: { status: 'active', interval: 'month', cancelAtPeriodEnd: false },
      },
    });
    expect(after.limits.maxHorizonMonths).toBe(24);
    expect(new Date(after.usage.periodStart).getTime()).toBe(
      subscription.items.data[0]!.current_period_start * 1000,
    );

    // Pro unlocks what Free blocked (a 24-month horizon), and a replayed webhook is harmless.
    await as('buyer')
      .post('/simulations')
      .send({ decisionText: 'What if I freelance?', model: { ...SARA_MODEL, horizonMonths: 24 } })
      .expect(201);
    await usersModel(app).updateOne({ _id: userId }, { $set: { 'usage.simulationsUsed': 1 } });
    await webhook('customer.subscription.created', subscription).expect(200);
    expect((await me('buyer')).usage.simulationsUsed).toBe(1);

    const again = await as('buyer')
      .post('/billing/checkout')
      .send({ plan: 'pro', interval: 'year' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_subscribed');
    const portal = await as('buyer').post('/billing/portal').expect(200);
    expect(portal.body.url).toBe('https://billing.stripe.test/cus_1');
  });

  it('switches plans in the same period without resetting usage, and downgrades on cancel', async () => {
    // The portal swaps the price on the same subscription, within the same billing period.
    const subscription = stripe.subscriptions.find((s) => s.customer === 'cus_1')!;
    const premium = priceLookupKey('premium', 'month');
    subscription.items.data[0]!.price = { id: `price_${premium}`, lookup_key: premium };
    await webhook('customer.subscription.updated', subscription).expect(200);
    expect(await me('buyer')).toMatchObject({ plan: 'premium', usage: { simulationsUsed: 1 } });

    subscription.status = 'canceled';
    await webhook('customer.subscription.deleted', subscription).expect(200);
    const downgraded = await me('buyer');
    expect(downgraded.plan).toBe('free');
    expect(downgraded.billing.subscription.status).toBe('canceled');
  });

  it('syncs right after Checkout, only for the session owner', async () => {
    const checkout = await as('fast')
      .post('/billing/checkout')
      .send({ plan: 'pro', interval: 'year' })
      .expect(200);
    const sessionId = (checkout.body.url as string).split('/').pop()!;
    const customer = (await usersModel(app)
      .findById((await me('fast')).id)
      .lean())!.stripeCustomerId!;
    stripe.subscribe(customer, 'pro', 'year');

    await as('someone-else').post('/billing/sync').send({ sessionId }).expect(404);
    await as('fast').post('/billing/sync').send({ sessionId: 'cs_test_missing' }).expect(404);
    await as('fast').post('/billing/sync').send({ sessionId: 'not-a-session' }).expect(400);
    await as('fast').post('/billing/sync').send({ sessionId }).expect(204);
    expect(await me('fast')).toMatchObject({
      plan: 'pro',
      billing: { subscription: { interval: 'year' } },
    });
  });

  it('finds the user from customer metadata when the webhook arrives first', async () => {
    const { id: userId } = await me('early');
    const customer = await stripe.fake.customers.create({ metadata: { userId } });
    stripe.subscribe(customer.id, 'premium', 'month');
    await webhook('invoice.paid', { id: 'in_1', customer: customer.id }).expect(200);
    expect((await me('early')).plan).toBe('premium');
  });

  it('acknowledges events it does not handle', async () => {
    await webhook('charge.succeeded', { id: 'ch_1' }).expect(200);
  });
});
