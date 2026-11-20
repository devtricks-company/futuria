import type { ScenarioKey, SimulationResult } from '@futuria/shared';

/*
 * Shared by the owner's results page (`/s/[id]`) and public share pages (`/share/[slug]`).
 */

/** A boxed view inside the results frame (chart, drivers, timeline). */
export const PANEL = 'rounded-2xl border border-border bg-surface-muted/40 p-4 sm:p-5';

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  optimistic: 'Optimistic',
  realistic: 'Realistic',
  pessimistic: 'Pessimistic',
};

/** The path the insights open on: the riskiest one that isn't "stay in my job". */
export function defaultPathId(result: Pick<SimulationResult, 'paths'>): string {
  const candidates = result.paths.filter((p) => p.type !== 'stay');
  const pool = candidates.length ? candidates : result.paths;
  return [...pool].sort((a, b) => b.metrics.probRunOut - a.metrics.probRunOut)[0]!.pathId;
}
