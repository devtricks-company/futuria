import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';
import {
  type DecisionModel,
  type FullAnalysis,
  SIMULATION_STATUSES,
  type SimulationStatus,
} from '@futuria/shared';

/*
 * Large structured payloads (model, analysis, intake, narrative) are stored as Mixed objects.
 * They are validated with the shared Zod schemas before they are written, not by Mongoose.
 */
@Schema({ collection: 'simulations', timestamps: true, minimize: false })
export class Simulation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, maxlength: 120 })
  title: string;

  @Prop({ type: String, required: true, maxlength: 1000 })
  decisionText: string;

  @Prop({ type: String, enum: SIMULATION_STATUSES, default: 'draft' })
  status: SimulationStatus;

  /** AI intake questions and answers (Phase 3). */
  @Prop({ type: Object, default: null })
  intake: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  model: DecisionModel | null;

  /** Engine seed: re-running the same model reproduces the same futures. */
  @Prop({ type: Number, required: true })
  seed: number;

  @Prop({ type: Object, default: null })
  analysis: FullAnalysis | null;

  /** Time Machine narrative per path (Phase 3). */
  @Prop({ type: Object, default: null })
  narrative: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  engineVersion: string | null;

  @Prop({ type: Date, default: null })
  lastRunAt: Date | null;

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop(
    raw({
      slug: { type: String, default: null },
      isPublic: { type: Boolean, default: false },
    }),
  )
  share: { slug: string | null; isPublic: boolean };

  /** Per-call Claude usage and cost records (Phase 3). */
  @Prop({ type: [Object], default: [] })
  aiUsage: Record<string, unknown>[];

  @Prop({ type: String, default: null })
  promptVersion: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export type SimulationDocument = HydratedDocument<Simulation>;
export const SimulationSchema = SchemaFactory.createForClass(Simulation);

SimulationSchema.index({ userId: 1, createdAt: -1 });
SimulationSchema.index(
  { 'share.slug': 1 },
  { unique: true, partialFilterExpression: { 'share.slug': { $type: 'string' } } },
);
