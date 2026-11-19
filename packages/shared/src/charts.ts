/*
 * Chart geometry built by the engine (`futuresChart`) and drawn by the web app: the landing hero,
 * public share pages, social cards and PDF reports. Coordinates are in viewBox units on a scale
 * that isn't part of the data, so the geometry alone reveals no amounts. With hidden money
 * (public shares), the only money fields are null.
 */

/** One option's simulated futures. */
export interface FutureBundle {
  pathId: string;
  name: string;
  /** Position in the model, which picks the path's colour slot. */
  index: number;
  /** SVG path data with one subpath per simulated future. */
  runs: string;
  /** SVG path data for the median savings curve. */
  median: string;
  /** Median savings at the horizon; null when money is hidden. */
  end: number | null;
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
  /** Savings today; null when money is hidden. */
  startCash: number | null;
  /** Fractions of the height (0 = top) for the starting savings and the emergency floor. */
  startY: number;
  floorY: number;
  bundles: FutureBundle[];
}
