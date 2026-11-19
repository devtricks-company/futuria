/*
 * Create (or update) FUTURIA's Stripe catalog: the Pro and Premium products, a monthly and a
 * yearly price for each (found by lookup key, e.g. futuria_pro_month), and the Customer Portal.
 * Prices come from PLANS in @futuria/shared. Idempotent: run it again after a price change and
 * it creates the new price, moves the lookup key to it and archives the old one (existing
 * subscribers keep their price).
 *
 *   pnpm --filter @futuria/api stripe:setup          # test mode (sk_test_...)
 *   pnpm --filter @futuria/api stripe:setup --live   # required for a live key
 *
 * Needs STRIPE_SECRET_KEY in apps/api/.env (or the environment).
 */
import Stripe from 'stripe';
import {
  BILLABLE_PLANS,
  BILLING_INTERVALS,
  type BillablePlanId,
  PLANS,
  planPrice,
  priceLookupKey,
} from '@futuria/shared';
import { hasFlag, loadEnvFile } from './lib/env.js';

loadEnvFile();
const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error('Set STRIPE_SECRET_KEY in apps/api/.env first (a test key: sk_test_...).');
  process.exit(1);
}
if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_') && !hasFlag('live')) {
  console.error('This is not a test-mode key. Pass --live to change the live catalog.');
  process.exit(1);
}

const stripe = new Stripe(key, { appInfo: { name: 'futuria-stripe-setup' } });
const PLAN_METADATA = 'futuria_plan';

async function productFor(plan: BillablePlanId): Promise<Stripe.Product> {
  const limits = PLANS[plan];
  const name = `FUTURIA ${limits.name}`;
  const description = `${limits.simulations} simulations a month, up to ${limits.maxHorizonMonths}-month horizons, ${limits.maxPaths} paths.`;
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata[PLAN_METADATA] === plan) {
      if (product.name !== name || product.description !== description) {
        return stripe.products.update(product.id, { name, description });
      }
      return product;
    }
  }
  return stripe.products.create({ name, description, metadata: { [PLAN_METADATA]: plan } });
}

async function ensurePrice(
  product: Stripe.Product,
  plan: BillablePlanId,
  interval: (typeof BILLING_INTERVALS)[number],
): Promise<{ price: Stripe.Price; action: string }> {
  const lookupKey = priceLookupKey(plan, interval);
  const amount = Math.round(planPrice(plan, interval) * 100);
  const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
  if (
    existing?.active &&
    existing.unit_amount === amount &&
    existing.currency === 'usd' &&
    existing.recurring?.interval === interval &&
    (typeof existing.product === 'string' ? existing.product : existing.product.id) === product.id
  ) {
    return { price: existing, action: 'unchanged' };
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { [PLAN_METADATA]: plan, interval },
  });
  if (existing?.active) await stripe.prices.update(existing.id, { active: false });
  return { price, action: existing ? `replaced ${existing.id}` : 'created' };
}

async function ensurePortal(products: { product: string; prices: string[] }[]): Promise<string> {
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations',
      products,
    },
  };
  const current = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 }))
    .data[0];
  if (current) {
    await stripe.billingPortal.configurations.update(current.id, { features });
    return `updated ${current.id}`;
  }
  const created = await stripe.billingPortal.configurations.create({ features });
  return `created ${created.id}`;
}

const portalProducts: { product: string; prices: string[] }[] = [];
console.log(`Stripe ${key.startsWith('sk_live_') ? 'LIVE' : 'test'} mode\n`);
for (const plan of BILLABLE_PLANS) {
  const product = await productFor(plan);
  const prices: string[] = [];
  console.log(`${product.name} (${product.id})`);
  for (const interval of BILLING_INTERVALS) {
    const { price, action } = await ensurePrice(product, plan, interval);
    prices.push(price.id);
    console.log(
      `  ${priceLookupKey(plan, interval).padEnd(22)} $${planPrice(plan, interval)}/${interval}  ${price.id}  ${action}`,
    );
  }
  portalProducts.push({ product: product.id, prices });
}
console.log(`\nCustomer Portal: ${await ensurePortal(portalProducts)}`);
console.log(
  '\nNext: pnpm --filter @futuria/api stripe:listen\n' +
    'and put the whsec_... it prints in STRIPE_WEBHOOK_SECRET (apps/api/.env).',
);
