/*
 * Forward Stripe test-mode webhooks to the local API (Stripe CLI 1.55+ needs the event list).
 *
 *   pnpm --filter @futuria/api stripe:listen
 *
 * Leave it running while you test payments. The first lines show the signing secret
 * (whsec_...): put it in STRIPE_WEBHOOK_SECRET in apps/api/.env and restart the API.
 * Needs the Stripe CLI (`winget install --id Stripe.StripeCli -e`) and `stripe login`.
 */
import { spawn } from 'node:child_process';
import { WEBHOOK_EVENTS } from '../src/billing/webhook-events.js';
import { loadEnvFile } from './lib/env.js';

loadEnvFile();
const port = process.env.PORT?.trim() || '4000';
const args = [
  'listen',
  '--forward-to',
  `localhost:${port}/billing/webhook`,
  '--events',
  WEBHOOK_EVENTS.join(','),
];

console.log(`stripe ${args.join(' ')}\n`);
// The CLI is a native executable (stripe.exe on Windows), so no shell is needed, and a missing
// CLI surfaces as ENOENT.
const child = spawn('stripe', args, { stdio: 'inherit' });
child.on('error', () => {
  console.error(
    'Could not run the Stripe CLI. Install it (winget install --id Stripe.StripeCli -e), open a ' +
      'new terminal, run `stripe login`, then try again.',
  );
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
