import {
  type DecisionModel,
  type DecisionModelInput,
  type RangeDistribution,
  type SensitivityItem,
  fixed,
  labelForField,
} from '@futuria/shared';
import { findPath, getField, uncertainFields, withField } from './model-utils';
import { clampRuns, parseModel, summarizePath } from './simulate';

export interface AnalysisOptions {
  seed: number;
  /** Runs per variant. Common random numbers keep comparisons stable at modest run counts. */
  runs?: number;
}

export const DEFAULT_ANALYSIS_RUNS = 500;

/**
 * One-at-a-time sensitivity ("what matters most"): pin each uncertain input to its low and
 * high value, keep everything else random with the same seed, and measure how far the median
 * cash at the horizon moves. Sorted by swing, largest first.
 */
export function analyzeSensitivity(
  input: DecisionModelInput | DecisionModel,
  pathId: string,
  options: AnalysisOptions,
): SensitivityItem[] {
  const model = parseModel(input);
  const runs = clampRuns(options.runs ?? DEFAULT_ANALYSIS_RUNS);
  const seed = options.seed >>> 0;

  const items = uncertainFields(model, pathId).map((field) => {
    const dist = getField(model, pathId, field) as RangeDistribution;
    const lowModel = withField(model, pathId, field, fixed(dist.low));
    const highModel = withField(model, pathId, field, fixed(dist.high));
    const low = summarizePath(lowModel, findPath(lowModel, pathId), seed, runs);
    const high = summarizePath(highModel, findPath(highModel, pathId), seed, runs);
    return {
      field,
      label: labelForField(field),
      low: { ...low, input: dist.low },
      high: { ...high, input: dist.high },
      swing: Math.abs(high.medianCashAtHorizon - low.medianCashAtHorizon),
      share: 0,
    } satisfies SensitivityItem;
  });

  const total = items.reduce((sum, item) => sum + item.swing, 0);
  for (const item of items)
    item.share = total > 0 ? Math.round((item.swing / total) * 1000) / 1000 : 0;
  return items.sort((a, b) => b.swing - a.swing);
}
