import type { Baseline, EngineEvent, PathConfig } from '@futuria/shared';
import type { Sampler } from '../distributions';

/** The five uniform draws every month consumes, whether or not the path uses them all. */
export interface MonthlyDraws {
  hazard: number;
  loss: number;
  severity: number;
  noiseA: number;
  noiseB: number;
}

/**
 * One simulated future of one path. `step` returns the person's net income from this path for
 * the month (after taxes and business costs; may be negative when a business loses money).
 * Living expenses and other income are handled by the simulator, not by paths.
 */
export interface PathRun {
  step(month: number, draws: MonthlyDraws, events: EngineEvent[] | null): number;
}

export type PathFactory<P extends PathConfig = PathConfig> = (
  path: P,
  baseline: Baseline,
  sampler: Sampler,
) => PathRun;

export const WEEKS_PER_MONTH = 52 / 12;
