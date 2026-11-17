import type {
  DecisionModel,
  DecisionModelInput,
  FullAnalysis,
  PathAnalysis,
} from '@futuria/shared';
import { evaluateInterventions } from './interventions';
import { analyzeSensitivity } from './sensitivity';
import { parseModel, simulate } from './simulate';

export interface AnalyzeOptions {
  seed: number;
  runs?: number;
  analysisRuns?: number;
}

/** Everything the dashboard needs: simulation, "what matters most" and the action plan. */
export function analyze(
  input: DecisionModelInput | DecisionModel,
  options: AnalyzeOptions,
): FullAnalysis {
  const model = parseModel(input);
  const result = simulate(model, { seed: options.seed, runs: options.runs });
  const analysisOptions = { seed: options.seed, runs: options.analysisRuns };
  const byPath: Record<string, PathAnalysis> = {};
  for (const path of model.paths) {
    byPath[path.id] = {
      sensitivity: analyzeSensitivity(model, path.id, analysisOptions),
      interventions: evaluateInterventions(model, path.id, analysisOptions),
    };
  }
  return { result, byPath };
}
