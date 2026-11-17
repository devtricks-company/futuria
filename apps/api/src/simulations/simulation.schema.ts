import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';
import {
  type AiUsageRecord,
  type DecisionModel,
  type FullAnalysis,
  type PathNarrative,
  SIMULATION_STATUSES,
  type SimulationIntake,
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

  /** AI intake: Claude's questions and proposed paths, the routing, and the person's answers. */
  @Prop({ type: Object, default: null })
  intake: SimulationIntake | null;

  @Prop({ type: Object, default: null })
  model: DecisionModel | null;

  /** Engine seed: re-running the same model reproduces the same futures. */
  @Prop({ type: Number, required: true })
  seed: number;

  @Prop({ type: Object, default: null })
  analysis: FullAnalysis | null;

  /** Time Machine narrative and action plan, keyed by path id. */
  @Prop({ type: Object, default: null })
  narrative: Record<string, PathNarrative> | null;

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

  /** Per-call Claude usage and cost records. */
  @Prop({ type: [Object], default: [] })
  aiUsage: AiUsageRecord[];

  /** Id of the pipeline run that owns the simulation; stale runs can't overwrite newer ones. */
  @Prop({ type: String, default: null })
  pipelineRunId: string | null;

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
