import { z } from 'zod';
import {
  type PathNarrative,
  type SimulationIntake,
  intakeAnswerSchema,
  proposedPathSchema,
} from './ai';
import { type DecisionModel, PATH_TYPES, decisionModelSchema } from './decision-model';
import {
  BILLABLE_PLANS,
  BILLING_INTERVALS,
  type BillingInterval,
  type PlanId,
  type PlanLimits,
} from './plans';
import type { FullAnalysis } from './results';

/*
 * Simulation lifecycle shared by the API (enforcement) and the web app (UI states).
 *
 *   draft ─► intake_ready ─► model_ready ─► queued ─► simulating ─► narrating ─► ready
 *
 * - A draft can also get a model directly (PATCH /model), skipping the AI intake.
 * - A draft whose intake is out of scope or a crisis stays a draft: the AI flow stops there.
 * - The run pipeline (Inngest) owns queued / simulating / narrating; any failure ends in failed.
 * - From ready or failed: edit answers (intake_ready), edit the model (model_ready), re-run or
 *   refresh the story (queued). A story-only refresh goes queued ─► narrating ─► ready and
 *   keeps the engine results.
 */
export const SIMULATION_STATUSES = [
  'draft',
  'intake_ready',
  'model_ready',
  'queued',
  'simulating',
  'narrating',
  'ready',
  'failed',
] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

export const STATUS_TRANSITIONS: Record<SimulationStatus, readonly SimulationStatus[]> = {
  draft: ['intake_ready', 'model_ready', 'failed'],
  intake_ready: ['intake_ready', 'model_ready', 'failed'],
  model_ready: ['intake_ready', 'model_ready', 'queued', 'failed'],
  queued: ['simulating', 'narrating', 'failed'],
  simulating: ['narrating', 'failed'],
  narrating: ['ready', 'failed'],
  ready: ['intake_ready', 'model_ready', 'queued'],
  failed: ['intake_ready', 'model_ready', 'queued'],
};

/** Statuses in which the run pipeline owns the simulation (edits and new runs are refused). */
export const BUSY_STATUSES: readonly SimulationStatus[] = ['queued', 'simulating', 'narrating'];

export function canTransition(from: SimulationStatus, to: SimulationStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Every status from which `to` can be reached (used for atomic, conditional updates). */
export function statusesThatCanReach(to: SimulationStatus): SimulationStatus[] {
  return SIMULATION_STATUSES.filter((from) => canTransition(from, to));
}

/* ---------- Request schemas ---------- */

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createSimulationRequestSchema = z.object({
  decisionText: z.string().trim().min(5).max(1000),
  title: z.string().trim().min(1).max(120).optional(),
  model: decisionModelSchema.optional(),
});
export type CreateSimulationRequest = z.output<typeof createSimulationRequestSchema>;

export const updateModelRequestSchema = z.object({
  model: decisionModelSchema,
});
export type UpdateModelRequest = z.output<typeof updateModelRequestSchema>;

/** Step 1 of the journey: a free-text decision, analyzed by Claude. */
export const intakeRequestSchema = z.object({
  decisionText: z.string().trim().min(5).max(1000),
});
export type IntakeRequest = z.output<typeof intakeRequestSchema>;

export const pathIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'Use lowercase letters, digits, "-" or "_" (max 32)');

/** Answers to the intake questions, plus the paths the person kept, renamed or added. */
export const intakeAnswersRequestSchema = z.object({
  answers: z
    .record(z.string().min(1).max(64), intakeAnswerSchema)
    .refine((answers) => Object.keys(answers).length <= 20, 'At most 20 answers'),
  paths: z
    .array(
      proposedPathSchema.extend({
        id: pathIdSchema,
        name: z.string().trim().min(1).max(80),
        type: z.enum(PATH_TYPES),
        summary: z.string().trim().max(300).default(''),
      }),
    )
    .min(1)
    .max(8)
    .refine((paths) => new Set(paths.map((p) => p.id)).size === paths.length, 'Duplicate path id')
    .optional(),
});
export type IntakeAnswersRequest = z.output<typeof intakeAnswersRequestSchema>;

/* ---------- Response shapes ---------- */

export interface SimulationDto {
  id: string;
  title: string;
  decisionText: string;
  status: SimulationStatus;
  intake: SimulationIntake | null;
  model: DecisionModel | null;
  seed: number;
  analysis: FullAnalysis | null;
  /** Time Machine narrative and action plan, keyed by path id. */
  narrative: Record<string, PathNarrative> | null;
  engineVersion: string | null;
  promptVersion: string | null;
  error: string | null;
  share: { slug: string | null; isPublic: boolean };
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
}

export interface SimulationSummaryDto {
  id: string;
  title: string;
  status: SimulationStatus;
  pathCount: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
}

export interface SubscriptionDto {
  /** Stripe subscription status (active, trialing, past_due, canceled, ...). */
  status: string;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface MeDto {
  id: string;
  plan: PlanId;
  /** A signed-out visitor with drafts (no account yet). They must sign up to run. */
  anonymous: boolean;
  usage: {
    periodStart: string;
    /** When the monthly quota resets; null for lifetime quotas (Free). */
    periodEnd: string | null;
    simulationsUsed: number;
  };
  limits: PlanLimits;
  billing: {
    /** False when the API runs without Stripe keys (local dev, CI). */
    enabled: boolean;
    subscription: SubscriptionDto | null;
  };
}

/* ---------- Billing ---------- */

export const checkoutRequestSchema = z.object({
  plan: z.enum(BILLABLE_PLANS),
  interval: z.enum(BILLING_INTERVALS),
});
export type CheckoutRequest = z.output<typeof checkoutRequestSchema>;

export const billingSyncRequestSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .regex(/^cs_[A-Za-z0-9_]{1,250}$/, 'Invalid checkout session id'),
});
export type BillingSyncRequest = z.output<typeof billingSyncRequestSchema>;

export interface BillingUrlDto {
  url: string;
}

/* ---------- Errors ---------- */

/**
 * Error codes the web app reacts to:
 * - plan_limit: the model needs a bigger plan (horizon, paths)
 * - plan_feature: the feature needs a bigger plan (story refresh, PDF export)
 * - quota_exceeded: no simulation runs left in this period
 * - signup_required: a signed-out visitor tried something that needs an account
 * - billing_disabled / already_subscribed: checkout can't start
 */
export const PLAN_ERROR_CODES = ['plan_limit', 'plan_feature', 'quota_exceeded'] as const;
export type PlanErrorCode = (typeof PLAN_ERROR_CODES)[number];

/** Error body for every 4xx/5xx response. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  issues?: { path: string; message: string }[];
  /** On plan errors: the cheapest plan that would allow the request. */
  requiredPlan?: PlanId;
}
