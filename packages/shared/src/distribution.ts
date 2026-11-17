import { z } from 'zod';

/**
 * Uncertain inputs are expressed as distributions so both people and Claude can state them
 * naturally: "between 1 and 4 months, most likely 2".
 *
 * - `fixed`: a known value (e.g. current savings).
 * - `range`: a triangular distribution defined by low / most-likely / high.
 */
export const fixedDistributionSchema = z.object({
  kind: z.literal('fixed'),
  value: z.number(),
});

export const rangeDistributionSchema = z.object({
  kind: z.literal('range'),
  low: z.number().describe('Pessimistic-but-plausible bound'),
  likely: z.number().describe('Most likely value'),
  high: z.number().describe('Optimistic-but-plausible bound'),
});

export const distributionSchema = z.discriminatedUnion('kind', [
  fixedDistributionSchema,
  rangeDistributionSchema,
]);

export type FixedDistribution = z.infer<typeof fixedDistributionSchema>;
export type RangeDistribution = z.infer<typeof rangeDistributionSchema>;
export type Distribution = z.infer<typeof distributionSchema>;

/** Shorthand constructor for a known value. */
export const fixed = (value: number): FixedDistribution => ({ kind: 'fixed', value });

/** Shorthand constructor for an uncertain value (low, most likely, high). */
export const range = (low: number, likely: number, high: number): RangeDistribution => ({
  kind: 'range',
  low,
  likely,
  high,
});

export function isDistribution(value: unknown): value is Distribution {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'fixed') return typeof v.value === 'number';
  if (v.kind === 'range')
    return typeof v.low === 'number' && typeof v.likely === 'number' && typeof v.high === 'number';
  return false;
}

/** The most likely value of a distribution (used for display and simple heuristics). */
export function likelyValue(d: Distribution): number {
  return d.kind === 'fixed' ? d.value : d.likely;
}

/** Multiply every point of a distribution by a factor. */
export function scaleDistribution(d: Distribution, factor: number): Distribution {
  return d.kind === 'fixed'
    ? fixed(d.value * factor)
    : range(d.low * factor, d.likely * factor, d.high * factor);
}
