import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { PLAN_IDS, type BillingInterval, type PlanId } from '@futuria/shared';

/** Stripe subscription state, synced from Stripe by BillingService (never from the client). */
export interface UserSubscription {
  id: string;
  status: string;
  priceLookupKey: string | null;
  interval: BillingInterval | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

@Schema({ collection: 'users', timestamps: true, minimize: false })
export class User {
  /**
   * Identity from the auth provider: a Clerk user id, "dev:<name>" in dev auth mode, or
   * "anon:<uuid>" for a signed-out visitor.
   */
  @Prop({ type: String, required: true, unique: true })
  externalId: string;

  @Prop({ type: String, default: null })
  email: string | null;

  /** A signed-out visitor: can draft simulations, must sign up to run them. */
  @Prop({ type: Boolean, default: false })
  anonymous: boolean;

  /** Anonymous users are deleted by a TTL index at this time; null for accounts. */
  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: String, enum: PLAN_IDS, default: 'free' })
  plan: PlanId;

  @Prop({ type: String, default: null })
  stripeCustomerId: string | null;

  @Prop({ type: Object, default: null })
  subscription: UserSubscription | null;

  /**
   * Simulation runs used in the current period. Free counts a lifetime total; monthly plans roll
   * every month from `periodStart`, which Stripe renewals re-anchor to the billing period.
   */
  @Prop(
    raw({
      periodStart: { type: Date, default: () => new Date() },
      simulationsUsed: { type: Number, default: 0 },
    }),
  )
  usage: { periodStart: Date; simulationsUsed: number };

  /** Saved financial baseline, reused to pre-fill the next simulation (Phase 4). */
  @Prop({ type: Object, default: null })
  baseline: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
UserSchema.index(
  { stripeCustomerId: 1 },
  { unique: true, partialFilterExpression: { stripeCustomerId: { $type: 'string' } } },
);
