import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../config/env.js';

/** DI token for the Stripe client; null when BILLING_MODE=disabled. Tests swap in a fake. */
export const STRIPE = Symbol('STRIPE');

export const stripeProvider: FactoryProvider<Stripe | null> = {
  provide: STRIPE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    if (config.get('BILLING_MODE', { infer: true }) !== 'stripe') return null;
    return new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true })!, {
      maxNetworkRetries: 2,
      appInfo: { name: 'futuria-api' },
    });
  },
};
