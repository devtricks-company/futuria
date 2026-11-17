/** Linear-interpolated quantile of an ascending-sorted array (q in [0, 1]). */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0]!;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  if (lo === hi || a === b) return a;
  return a + (b - a) * (pos - lo);
}

/** Median of integer months where "never" is encoded as 0; returns null if most runs never. */
export function medianMonth(months: Int32Array): number | null {
  const values = Float64Array.from(months, (m) => (m > 0 ? m : Number.POSITIVE_INFINITY)).sort();
  const mid = values[Math.floor(values.length / 2)];
  return mid === undefined || !Number.isFinite(mid) ? null : mid;
}

/** Median of the positive entries only (e.g. month of running out, among runs that did). */
export function medianOfPositive(months: Int32Array): number | null {
  const values = Float64Array.from(months.filter((m) => m > 0)).sort();
  if (values.length === 0) return null;
  return Math.round(quantileSorted(values, 0.5));
}

export const round = (value: number): number => Math.round(value);
export const round3 = (value: number): number => Math.round(value * 1000) / 1000;
export const round2 = (value: number): number => Math.round(value * 100) / 100;
