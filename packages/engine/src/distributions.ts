import type { Distribution } from '@futuria/shared';
import type { Rng } from './rng';

/**
 * Inverse CDF of a triangular distribution. Uses exactly one uniform draw, which keeps random
 * streams aligned when a range is replaced by a fixed value (see rng.ts). Inputs are sorted
 * defensively so a mis-ordered range never produces NaN.
 */
export function triangularInverse(u: number, low: number, likely: number, high: number): number {
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  const c = Math.min(b, Math.max(a, likely));
  if (b === a) return a;
  const fc = (c - a) / (b - a);
  if (u < fc) return a + Math.sqrt(u * (b - a) * (c - a));
  return b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

export function sampleDistribution(d: Distribution, u: number): number {
  return d.kind === 'fixed' ? d.value : triangularInverse(u, d.low, d.likely, d.high);
}

/**
 * Draws per-run parameters from the parameter stream and records them by field path, so the
 * scenario narrative can say "in this future your rate was $58/h".
 */
export class Sampler {
  readonly sampled: Record<string, number> = {};

  constructor(private readonly rng: Rng) {}

  /** Sample a distribution. Always consumes exactly one draw, even for fixed values. */
  dist(field: string, d: Distribution): number {
    const u = this.rng();
    const value = sampleDistribution(d, u);
    this.sampled[field] = value;
    return value;
  }

  /** Optional distribution: still consumes one draw so streams stay aligned. */
  optionalDist(field: string, d: Distribution | undefined, fallback: number): number {
    if (!d) {
      this.rng();
      return fallback;
    }
    return this.dist(field, d);
  }

  uniform(): number {
    return this.rng();
  }
}

/** Months are sampled as continuous values and rounded to whole, non-negative months. */
export function wholeMonths(value: number): number {
  return Math.max(0, Math.round(value));
}

/** Convert a yearly probability into an equivalent monthly hazard. */
export function monthlyHazard(annualProbability: number): number {
  if (annualProbability <= 0) return 0;
  if (annualProbability >= 1) return 1;
  return 1 - Math.pow(1 - annualProbability, 1 / 12);
}
