import type { DecisionModel, FuturesChart, SimulationResult } from '@futuria/shared';
import { runOnce } from './simulate';

export interface FuturesChartOptions {
  seed: number;
  /** Futures drawn per path (the first N runs of the simulation). */
  runsPerPath?: number;
  width?: number;
  height?: number;
  /** Smallest gap between end labels, as a fraction of the height. */
  labelGap?: number;
  /**
   * Leave out amounts (today's savings, each median's end) for public views. The geometry stays:
   * its scale isn't part of the output, so it reveals shapes, not amounts.
   */
  hideMoney?: boolean;
  /** Most points per line: long horizons are sampled down (always keeping today and the end). */
  maxPoints?: number;
}

/** Months to draw: every month, or evenly spaced ones (always 0 and the horizon) up to `max`. */
export function chartMonths(horizon: number, max = Infinity): number[] {
  const all = Array.from({ length: horizon + 1 }, (_, m) => m);
  if (all.length <= max) return all;
  const step = horizon / (Math.max(2, Math.floor(max)) - 1);
  const picked = new Set<number>();
  for (let k = 0; k * step < horizon; k++) picked.add(Math.round(k * step));
  picked.add(horizon);
  return [...picked].sort((a, b) => a - b);
}

function pathData(
  series: ArrayLike<number>,
  months: number[],
  x: (m: number) => number,
  y: (v: number) => number,
) {
  let d = '';
  for (let k = 0; k < months.length; k++) {
    const m = months[k]!;
    d += `${k === 0 ? 'M' : 'L'}${Math.round(x(m))} ${Math.round(y(series[m]!))}`;
  }
  return d;
}

/** Spreads label positions (0-1) apart by at least `gap`, keeping their order and range. */
export function spreadLabels(positions: number[], gap: number): number[] {
  const order = positions.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const placed = order.map((o) => o.p);
  for (let k = 1; k < placed.length; k++) {
    placed[k] = Math.max(placed[k]!, placed[k - 1]! + gap);
  }
  // If the last label was pushed past the bottom, shift the stack back up.
  const overflow = placed.length ? placed[placed.length - 1]! - 1 : 0;
  if (overflow > 0) {
    for (let k = placed.length - 1; k >= 0; k--) {
      placed[k] = k === placed.length - 1 ? 1 : Math.min(placed[k]!, placed[k + 1]! - gap);
    }
  }
  const out = new Array<number>(positions.length);
  order.forEach((o, k) => (out[o.i] = Math.max(0, placed[k]!)));
  return out;
}

/**
 * Chart data for simulated futures: the first `runsPerPath` futures of every path, re-run with
 * the same seed as `result`, so each line is one of the futures behind the published numbers.
 * Used by the landing hero, public share pages, social cards and PDF reports.
 */
export function futuresChart(
  model: DecisionModel,
  result: SimulationResult,
  {
    seed,
    runsPerPath = 64,
    width = 1200,
    height = 400,
    labelGap = 0.16,
    hideMoney = false,
    maxPoints,
  }: FuturesChartOptions,
): FuturesChart {
  const H = model.horizonMonths;
  const floor = model.baseline.emergencyFloor;
  const months = chartMonths(H, maxPoints);
  const runs = model.paths.map((path) =>
    Array.from({ length: runsPerPath }, (_, i) => runOnce(model, path, seed, i).cash),
  );
  const medians = model.paths.map(
    (path) => result.paths.find((p) => p.pathId === path.id)?.cash.p50 ?? [],
  );

  let lo = Math.min(floor, model.baseline.startingCash);
  let hi = Math.max(floor, model.baseline.startingCash);
  for (const series of [...runs.flat(), ...medians]) {
    for (const m of months) {
      const v = series[m];
      if (v === undefined) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad;
  hi += pad;

  const x = (m: number) => (m / H) * width;
  const y = (v: number) => ((hi - v) / (hi - lo)) * height;
  const frac = (v: number) => (hi - v) / (hi - lo);

  const ends = medians.map((s) => s[s.length - 1] ?? model.baseline.startingCash);
  const labelY = spreadLabels(ends.map(frac), labelGap);

  return {
    width,
    height,
    horizonMonths: H,
    startCash: hideMoney ? null : model.baseline.startingCash,
    startY: frac(model.baseline.startingCash),
    floorY: frac(floor),
    bundles: model.paths.map((path, index) => ({
      pathId: path.id,
      name: path.name,
      index,
      runs: runs[index]!.map((series) => pathData(series, months, x, y)).join(''),
      median: pathData(medians[index]!, months, x, y),
      end: hideMoney ? null : ends[index]!,
      endY: frac(ends[index]!),
      labelY: labelY[index]!,
      probRunOut: result.paths.find((p) => p.pathId === path.id)?.metrics.probRunOut ?? 0,
    })),
  };
}
