import type { DecisionModel, SimulationResult } from '@futuria/shared';
import { runOnce } from '@futuria/engine';

/** One option's simulated futures, ready to draw on the landing page's hero chart. */
export interface FutureBundle {
  pathId: string;
  name: string;
  /** Position in the model, which picks the path's colour slot. */
  index: number;
  /** SVG path data with one subpath per simulated future. */
  runs: string;
  /** SVG path data for the median savings curve. */
  median: string;
  /** Median savings at the horizon. */
  end: number;
  /** Where the median ends, from 0 (top) to 1 (bottom). */
  endY: number;
  /** Where the end label goes: endY, nudged so labels don't overlap. */
  labelY: number;
  probRunOut: number;
}

export interface FuturesChart {
  /** The SVG viewBox size. Coordinates are in these units. */
  width: number;
  height: number;
  horizonMonths: number;
  startCash: number;
  /** Fractions of the height (0 = top) for the starting savings and the emergency floor. */
  startY: number;
  floorY: number;
  bundles: FutureBundle[];
}

export interface FuturesChartOptions {
  seed: number;
  /** Futures drawn per path (the first N runs of the simulation). */
  runsPerPath?: number;
  width?: number;
  height?: number;
  /** Smallest gap between end labels, as a fraction of the height. */
  labelGap?: number;
}

function pathData(series: ArrayLike<number>, x: (m: number) => number, y: (v: number) => number) {
  let d = '';
  for (let m = 0; m < series.length; m++) {
    d += `${m === 0 ? 'M' : 'L'}${Math.round(x(m))} ${Math.round(y(series[m]!))}`;
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
 * The hero chart's data: the first `runsPerPath` simulated futures of every path, re-run with the
 * same seed as `result`, so each line is one of the futures behind the published numbers.
 */
export function futuresChart(
  model: DecisionModel,
  result: SimulationResult,
  { seed, runsPerPath = 64, width = 1200, height = 400, labelGap = 0.16 }: FuturesChartOptions,
): FuturesChart {
  const H = model.horizonMonths;
  const floor = model.baseline.emergencyFloor;
  const runs = model.paths.map((path) =>
    Array.from({ length: runsPerPath }, (_, i) => runOnce(model, path, seed, i).cash),
  );
  const medians = model.paths.map(
    (path) => result.paths.find((p) => p.pathId === path.id)?.cash.p50 ?? [],
  );

  let lo = Math.min(floor, model.baseline.startingCash);
  let hi = Math.max(floor, model.baseline.startingCash);
  for (const series of [...runs.flat(), ...medians]) {
    for (let m = 0; m < series.length; m++) {
      lo = Math.min(lo, series[m]!);
      hi = Math.max(hi, series[m]!);
    }
  }
  const pad = (hi - lo) * 0.06;
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
    startCash: model.baseline.startingCash,
    startY: frac(model.baseline.startingCash),
    floorY: frac(floor),
    bundles: model.paths.map((path, index) => ({
      pathId: path.id,
      name: path.name,
      index,
      runs: runs[index]!.map((series) => pathData(series, x, y)).join(''),
      median: pathData(medians[index]!, x, y),
      end: ends[index]!,
      endY: frac(ends[index]!),
      labelY: labelY[index]!,
      probRunOut: result.paths.find((p) => p.pathId === path.id)?.metrics.probRunOut ?? 0,
    })),
  };
}
