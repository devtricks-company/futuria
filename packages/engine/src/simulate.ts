import {
  type DecisionModel,
  type DecisionModelInput,
  type EngineEvent,
  type OutcomeSummary,
  type PathConfig,
  type PathMetrics,
  type PathResult,
  PERCENTILES,
  type PercentileKey,
  type PercentileSeries,
  type RunTrace,
  SCENARIO_PERCENTILE,
  SCENARIOS,
  type ScenarioKey,
  type SimulationResult,
  decisionModelSchema,
} from '@futuria/shared';
import { Sampler } from './distributions';
import { createPathRun, type MonthlyDraws } from './paths';
import { STREAM_EVENTS, STREAM_PARAMS, runRng } from './rng';
import { medianMonth, medianOfPositive, quantileSorted, round, round2, round3 } from './stats';

export const ENGINE_VERSION = '1.0.0';
export const DEFAULT_RUNS = 1000;
export const MAX_RUNS = 20000;

const QUANTILE: Record<PercentileKey, number> = {
  p10: 0.1,
  p25: 0.25,
  p50: 0.5,
  p75: 0.75,
  p90: 0.9,
};

/** Baseline draws share one stream across paths, so run i has the same expenses on every path. */
const BASELINE_STREAM_ID = '__baseline__';

export interface SimulateOptions {
  seed: number;
  runs?: number;
  /** Only simulate these paths (default: all). */
  pathIds?: string[];
}

/** Parse and apply defaults. Throws a ZodError for invalid input. */
export function parseModel(input: DecisionModelInput | DecisionModel): DecisionModel {
  return decisionModelSchema.parse(input);
}

interface SingleRun {
  cash: Float64Array;
  income: Float64Array;
  expenses: Float64Array;
  ranOutMonth: number;
  breakEvenMonth: number;
  events: EngineEvent[] | null;
  sampled: Record<string, number>;
}

/** Simulate one future of one path. Deterministic for a given (seed, path id, run index). */
export function runOnce(
  model: DecisionModel,
  path: PathConfig,
  seed: number,
  runIndex: number,
  captureEvents = false,
): SingleRun {
  const { baseline, horizonMonths: H } = model;
  const baselineSampler = new Sampler(runRng(seed, BASELINE_STREAM_ID, runIndex, STREAM_PARAMS));
  const baseExpenses = baselineSampler.dist('baseline.monthlyExpenses', baseline.monthlyExpenses);

  const sampler = new Sampler(runRng(seed, path.id, runIndex, STREAM_PARAMS));
  const pathRun = createPathRun(path, baseline, sampler);
  const eventRng = runRng(seed, path.id, runIndex, STREAM_EVENTS);

  const cash = new Float64Array(H + 1);
  const income = new Float64Array(H + 1);
  const expenses = new Float64Array(H + 1);
  const events: EngineEvent[] | null = captureEvents ? [] : null;
  cash[0] = baseline.startingCash;

  const expenseGrowth = Math.pow(1 + baseline.annualExpenseGrowth, 1 / 12);
  const draws: MonthlyDraws = { hazard: 0, loss: 0, severity: 0, noiseA: 0, noiseB: 0 };
  let ranOutMonth = 0;
  let breakEvenMonth = 0;

  for (let m = 1; m <= H; m++) {
    // Always consume five draws per month so streams stay aligned across input changes.
    draws.hazard = eventRng();
    draws.loss = eventRng();
    draws.severity = eventRng();
    draws.noiseA = eventRng();
    draws.noiseB = eventRng();

    const monthIncome = pathRun.step(m, draws, events) + baseline.otherMonthlyIncome;
    const monthExpenses = baseExpenses * Math.pow(expenseGrowth, m - 1);
    income[m] = monthIncome;
    expenses[m] = monthExpenses;
    cash[m] = cash[m - 1]! + monthIncome - monthExpenses;

    if (ranOutMonth === 0 && cash[m]! < baseline.emergencyFloor) {
      ranOutMonth = m;
      events?.push({ month: m, type: 'ran_out' });
    }
  }

  // Sustained break-even: the first month from which income covers expenses (on a rolling
  // 3-month average) for the rest of the horizon. A salary that later stops (hybrid, layoff)
  // does not count as having broken even.
  for (let m = H; m >= 1; m--) {
    let incomeSum = 0;
    let expenseSum = 0;
    for (let k = Math.max(1, m - 2); k <= m; k++) {
      incomeSum += income[k]!;
      expenseSum += expenses[k]!;
    }
    if (incomeSum < expenseSum) break;
    breakEvenMonth = m;
  }

  return {
    cash,
    income,
    expenses,
    ranOutMonth,
    breakEvenMonth,
    events,
    sampled: { ...baselineSampler.sampled, ...sampler.sampled },
  };
}

interface PathRuns {
  runs: SingleRun[];
  ranOut: Int32Array;
  breakEven: Int32Array;
}

function runAll(model: DecisionModel, path: PathConfig, seed: number, runs: number): PathRuns {
  const all: SingleRun[] = new Array(runs);
  const ranOut = new Int32Array(runs);
  const breakEven = new Int32Array(runs);
  for (let i = 0; i < runs; i++) {
    const r = runOnce(model, path, seed, i);
    all[i] = r;
    ranOut[i] = r.ranOutMonth;
    breakEven[i] = r.breakEvenMonth;
  }
  return { runs: all, ranOut, breakEven };
}

function percentileSeries(
  runs: SingleRun[],
  pick: (r: SingleRun) => Float64Array,
  months: number,
): PercentileSeries {
  const series = Object.fromEntries(
    PERCENTILES.map((k) => [k, new Array<number>(months + 1)]),
  ) as Record<PercentileKey, number[]>;
  const column = new Float64Array(runs.length);
  for (let m = 0; m <= months; m++) {
    for (let i = 0; i < runs.length; i++) column[i] = pick(runs[i]!)[m]!;
    column.sort();
    for (const k of PERCENTILES) series[k][m] = round(quantileSorted(column, QUANTILE[k]));
  }
  return series;
}

function horizonCashMedian(runs: SingleRun[], H: number): number {
  const finals = Float64Array.from(runs, (r) => r.cash[H]!).sort();
  return round(quantileSorted(finals, 0.5));
}

function summarize(model: DecisionModel, data: PathRuns): OutcomeSummary {
  const n = data.runs.length;
  return {
    probRunOut: round3(data.ranOut.filter((m) => m > 0).length / n),
    medianCashAtHorizon: horizonCashMedian(data.runs, model.horizonMonths),
    medianBreakEvenMonth: medianMonth(data.breakEven),
  };
}

/** Index of the run whose cash trajectory stays closest to the target percentile curve. */
function representativeRun(runs: SingleRun[], target: number[]): number {
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs.length; i++) {
    const cash = runs[i]!.cash;
    let score = 0;
    for (let m = 1; m < target.length; m++) {
      const diff = cash[m]! - target[m]!;
      score += diff * diff;
      if (score >= bestScore) break;
    }
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function toTrace(run: SingleRun, runIndex: number): RunTrace {
  return {
    runIndex,
    sampled: Object.fromEntries(Object.entries(run.sampled).map(([k, v]) => [k, round2(v)])),
    cash: Array.from(run.cash, round),
    income: Array.from(run.income, round),
    expenses: Array.from(run.expenses, round),
    events: run.events ?? [],
  };
}

export function simulatePath(
  model: DecisionModel,
  path: PathConfig,
  seed: number,
  runs: number,
): PathResult {
  const H = model.horizonMonths;
  const data = runAll(model, path, seed, runs);
  const cash = percentileSeries(data.runs, (r) => r.cash, H);
  const income = percentileSeries(data.runs, (r) => r.income, H);
  const expensesP50 = percentileSeries(data.runs, (r) => r.expenses, H).p50;
  const summary = summarize(model, data);

  let lowest = { month: 0, value: cash.p50[0]! };
  for (let m = 1; m <= H; m++) {
    if (cash.p50[m]! < lowest.value) lowest = { month: m, value: cash.p50[m]! };
  }

  const n = data.runs.length;
  const metrics: PathMetrics = {
    probRunOut: summary.probRunOut,
    medianRunOutMonth: medianOfPositive(data.ranOut),
    probBreakEven: round3(data.breakEven.filter((m) => m > 0).length / n),
    medianBreakEvenMonth: summary.medianBreakEvenMonth,
    cashAtHorizon: { p10: cash.p10[H]!, p50: cash.p50[H]!, p90: cash.p90[H]! },
    incomeAtHorizon: { p10: income.p10[H]!, p50: income.p50[H]!, p90: income.p90[H]! },
    lowestMedianCash: lowest,
  };

  const scenarios = {} as Record<ScenarioKey, RunTrace>;
  for (const key of SCENARIOS) {
    const index = representativeRun(data.runs, cash[SCENARIO_PERCENTILE[key]]);
    // Re-run deterministically with event capture (cheap: one run).
    scenarios[key] = toTrace(runOnce(model, path, seed, index, true), index);
  }

  return {
    pathId: path.id,
    name: path.name,
    type: path.type,
    cash,
    income,
    expensesP50,
    metrics,
    scenarios,
  };
}

/** Cheaper variant used by sensitivity analysis and interventions. */
export function summarizePath(
  model: DecisionModel,
  path: PathConfig,
  seed: number,
  runs: number,
): OutcomeSummary {
  return summarize(model, runAll(model, path, seed, runs));
}

export function clampRuns(runs: number | undefined): number {
  const value = Math.round(runs ?? DEFAULT_RUNS);
  return Math.min(MAX_RUNS, Math.max(1, value));
}

/** Simulate every path of a decision model. Pure and deterministic for a given seed. */
export function simulate(
  input: DecisionModelInput | DecisionModel,
  options: SimulateOptions,
): SimulationResult {
  const model = parseModel(input);
  const seed = options.seed >>> 0;
  const runs = clampRuns(options.runs);
  const paths = options.pathIds
    ? model.paths.filter((p) => options.pathIds!.includes(p.id))
    : model.paths;

  return {
    engineVersion: ENGINE_VERSION,
    seed,
    runs,
    horizonMonths: model.horizonMonths,
    currency: model.baseline.currency,
    paths: paths.map((path) => simulatePath(model, path, seed, runs)),
  };
}
