import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { PLAN_IDS, type PlanId } from '@futuria/shared';

@Schema({ collection: 'users', timestamps: true, minimize: false })
export class User {
  /** Identity from the auth provider: a Clerk user id, or "dev:<name>" in dev auth mode. */
  @Prop({ type: String, required: true, unique: true })
  externalId: string;

  @Prop({ type: String, default: null })
  email: string | null;

  @Prop({ type: String, enum: PLAN_IDS, default: 'free' })
  plan: PlanId;

  @Prop({ type: String, default: null })
  stripeCustomerId: string | null;

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
