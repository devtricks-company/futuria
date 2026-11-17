import type { PathType } from './decision-model';

/*
 * Engine outputs. Arrays are indexed by month: index 0 is "today" (month 0) and index H is the
 * horizon, so every series has length horizonMonths + 1. Income and expenses at index 0 are 0.
 * Currency values are rounded to whole units.
 */

export const PERCENTILES = ['p10', 'p25', 'p50', 'p75', 'p90'] as const;
export type PercentileKey = (typeof PERCENTILES)[number];
export type PercentileSeries = Record<PercentileKey, number[]>;

export const SCENARIOS = ['optimistic', 'realistic', 'pessimistic'] as const;
export type ScenarioKey = (typeof SCENARIOS)[number];

/** Which cash percentile each named scenario follows. */
export const SCENARIO_PERCENTILE: Record<ScenarioKey, PercentileKey> = {
  optimistic: 'p90',
  realistic: 'p50',
  pessimistic: 'p10',
};

export type EngineEventType =
  | 'first_client'
  | 'client_lost'
  | 'layoff'
  | 'reemployed'
  | 'first_revenue'
  | 'funded'
  | 'startup_failed'
  | 'job_found'
  | 'switched_full_time'
  | 'ran_out';

export interface EngineEvent {
  month: number;
  type: EngineEventType;
  detail?: string;
}

/** One concrete simulated future, used as the backbone of a scenario narrative. */
export interface RunTrace {
  runIndex: number;
  /** Values drawn for this run, keyed by model field path (e.g. "hourlyRate"). */
  sampled: Record<string, number>;
  cash: number[];
  income: number[];
  expenses: number[];
  events: EngineEvent[];
}

export interface Spread {
  p10: number;
  p50: number;
  p90: number;
}

export interface PathMetrics {
  /** Share of futures in which cash drops below the emergency floor at some point. */
  probRunOut: number;
  /** Median month of first running out, among the futures that ran out. */
  medianRunOutMonth: number | null;
  /**
   * Share of futures that reach a sustained break-even: a month from which income covers
   * expenses (3-month rolling average) for the rest of the horizon.
   */
  probBreakEven: number;
  /** Median sustained break-even month across all futures, or null if most never get there. */
  medianBreakEvenMonth: number | null;
  cashAtHorizon: Spread;
  incomeAtHorizon: Spread;
  lowestMedianCash: { month: number; value: number };
}

export interface PathResult {
  pathId: string;
  name: string;
  type: PathType;
  cash: PercentileSeries;
  income: PercentileSeries;
  expensesP50: number[];
  metrics: PathMetrics;
  scenarios: Record<ScenarioKey, RunTrace>;
}

export interface SimulationResult {
  engineVersion: string;
  seed: number;
  runs: number;
  horizonMonths: number;
  currency: string;
  paths: PathResult[];
}

export interface OutcomeSummary {
  probRunOut: number;
  medianCashAtHorizon: number;
  medianBreakEvenMonth: number | null;
}

/** One bar of the "what matters most" tornado chart. */
export interface SensitivityItem {
  /** Dot path of the field, e.g. "hourlyRate" or "baseline.monthlyExpenses". */
  field: string;
  label: string;
  low: OutcomeSummary & { input: number };
  high: OutcomeSummary & { input: number };
  /** Absolute difference in median cash at the horizon between low and high. */
  swing: number;
  /** This item's share of the total swing across all items (0–1). */
  share: number;
}

export interface InterventionResult {
  id: string;
  label: string;
  description: string;
  before: OutcomeSummary;
  after: OutcomeSummary;
}

export interface PathAnalysis {
  sensitivity: SensitivityItem[];
  interventions: InterventionResult[];
}

export interface FullAnalysis {
  result: SimulationResult;
  byPath: Record<string, PathAnalysis>;
}
