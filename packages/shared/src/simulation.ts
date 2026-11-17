import { z } from 'zod';
import { type DecisionModel, decisionModelSchema } from './decision-model';
import type { PlanId, PlanLimits } from './plans';
import type { FullAnalysis } from './results';

/*
 * Simulation lifecycle shared by the API (enforcement) and the web app (UI states).
 *
 *   draft ─► intake_ready ─► model_ready ─► queued ─► simulating ─► narrating ─► ready
 *                                 ▲                       │             │         │
 *                                 └──── edit model ◄──────┴─────────────┴── failed ┘
 *
 * Phase 2 runs the engine synchronously (model_ready ─► simulating ─► ready). Phase 3 adds
 * the AI intake, the Inngest queue and the narrative step.
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
  intake_ready: ['model_ready', 'failed'],
  model_ready: ['model_ready', 'queued', 'simulating', 'failed'],
  queued: ['simulating', 'failed'],
  simulating: ['narrating', 'ready', 'failed'],
  narrating: ['ready', 'failed'],
  ready: ['model_ready', 'queued', 'simulating'],
  failed: ['model_ready', 'queued', 'simulating'],
};

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

/* ---------- Response shapes ---------- */

export interface SimulationDto {
  id: string;
  title: string;
  decisionText: string;
  status: SimulationStatus;
  model: DecisionModel | null;
  seed: number;
  analysis: FullAnalysis | null;
  engineVersion: string | null;
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

export interface MeDto {
  id: string;
  plan: PlanId;
  usage: { periodStart: string; simulationsUsed: number };
  limits: PlanLimits;
}

/** Error body for every 4xx/5xx response. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  issues?: { path: string; message: string }[];
}
