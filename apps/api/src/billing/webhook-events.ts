/**
 * The Stripe (snapshot) events BillingService.handleWebhook acts on. `stripe:listen` forwards
 * exactly these locally; a production webhook endpoint should subscribe to the same list.
 */
export const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
] as const;
