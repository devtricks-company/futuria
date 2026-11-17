import {
  type DecisionModel,
  type EngineEvent,
  type FullAnalysis,
  type OutcomeSummary,
  type PathType,
  SCENARIOS,
  type ScenarioKey,
  type Spread,
  isDistribution,
  labelForField,
} from '@futuria/shared';
import { getField } from '@futuria/engine';

/*
 * The only numbers writeNarrative may use. Built from the engine's representative runs (the
 * actual simulated futures closest to P10 / P50 / P90 final cash), so each scenario is one
 * coherent life path, not a stitched-together set of percentiles.
 */

export interface MonthFact {
  month: number;
  cash: number;
  income: number;
  expenses: number;
}

export interface ScenarioFacts {
  months: MonthFact[];
  events: EngineEvent[];
}

export interface NarrativeFacts {
  path: { id: string; name: string; type: PathType };
  currency: string;
  horizonMonths: number;
  milestoneMonths: number[];
  scenarios: Record<ScenarioKey, ScenarioFacts>;
  metrics: {
    probRunOut: number;
    probBreakEven: number;
    medianBreakEvenMonth: number | null;
    cashAtHorizon: Spread;
    incomeAtHorizon: Spread;
  };
  topDrivers: { label: string; share: number }[];
  interventions: {
    id: string;
    label: string;
    description: string;
    before: OutcomeSummary;
    after: OutcomeSummary;
  }[];
  assumptions: { label: string; value: string; source: string; confidence: string }[];
}

/** Time Machine months: 1/3/6/9/12, then wider steps for longer horizons, always the horizon. */
export function milestoneMonths(horizon: number): number[] {
  const months = [1, 3, 6, 9, 12, 18, 24, 36, 48, 60, 90, 120].filter((m) => m <= horizon);
  if (!months.includes(horizon)) months.push(horizon);
  return months;
}

const round = (value: number) => Math.round(value);

function describeValue(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  if (isDistribution(value)) {
    return value.kind === 'fixed'
      ? String(value.value)
      : `${value.low} to ${value.high} (most likely ${value.likely})`;
  }
  return null;
}

export function buildNarrativeFacts(
  model: DecisionModel,
  analysis: FullAnalysis,
  pathId: string,
): NarrativeFacts {
  const result = analysis.result.paths.find((p) => p.pathId === pathId);
  if (!result) throw new Error(`No engine result for path "${pathId}"`);
  const horizon = analysis.result.horizonMonths;
  const months = milestoneMonths(horizon);

  const scenarios = Object.fromEntries(
    SCENARIOS.map((key) => {
      const run = result.scenarios[key];
      return [
        key,
        {
          months: months.map((m) => ({
            month: m,
            cash: round(run.cash[m] ?? 0),
            income: round(run.income[m] ?? 0),
            expenses: round(run.expenses[m] ?? 0),
          })),
          events: run.events.filter((e) => e.month <= horizon).slice(0, 20),
        },
      ];
    }),
  ) as Record<ScenarioKey, ScenarioFacts>;

  const byPath = analysis.byPath[pathId];
  const assumptions = model.assumptions
    .filter((a) => a.pathId === pathId || a.pathId === null)
    .flatMap((a) => {
      let value: string | null;
      try {
        value = describeValue(getField(model, pathId, a.field));
      } catch {
        value = null; // the assumption names a field that doesn't exist: leave it out
      }
      return value === null
        ? []
        : [
            {
              label: a.label || labelForField(a.field),
              value,
              source: a.source,
              confidence: a.confidence,
            },
          ];
    });

  return {
    path: { id: result.pathId, name: result.name, type: result.type },
    currency: analysis.result.currency,
    horizonMonths: horizon,
    milestoneMonths: months,
    scenarios,
    metrics: {
      probRunOut: result.metrics.probRunOut,
      probBreakEven: result.metrics.probBreakEven,
      medianBreakEvenMonth: result.metrics.medianBreakEvenMonth,
      cashAtHorizon: result.metrics.cashAtHorizon,
      incomeAtHorizon: result.metrics.incomeAtHorizon,
    },
    topDrivers: (byPath?.sensitivity ?? [])
      .slice(0, 3)
      .map((s) => ({ label: s.label, share: Number(s.share.toFixed(2)) })),
    interventions: (byPath?.interventions ?? []).map((i) => ({
      id: i.id,
      label: i.label,
      description: i.description,
      before: i.before,
      after: i.after,
    })),
    assumptions,
  };
}
