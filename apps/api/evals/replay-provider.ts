import { readFileSync } from 'node:fs';
import type { AiStep, AiUsageRecord, IntakeResult, PathNarrative } from '@futuria/shared';
import type {
  AiCallResult,
  AiProvider,
  BuildModelInput,
  IntakeInput,
  NarrativeInput,
} from '../src/ai/ai.types.js';
import type { ModelOutput } from '../src/ai/model-output.schema.js';
import { PERSONAS } from './personas.js';

/**
 * Replays the Claude outputs saved in an eval report, so changed checks (grounding, guarantee
 * language, clamps) can be re-scored on real outputs for free:
 *
 *   pnpm --filter @futuria/api eval --replay evals/results/<report>.json
 *
 * The engine runs again with the eval's fixed seed, so narratives meet the same facts.
 */
export class ReplayAiProvider implements AiProvider {
  readonly kind = 'fixture' as const;
  private readonly byText = new Map<string, Record<string, unknown>>();

  constructor(reportFile: string) {
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as {
      results: { id: string; outputs?: Record<string, unknown> }[];
    };
    for (const result of report.results) {
      const persona = PERSONAS.find((p) => p.id === result.id);
      if (persona && result.outputs) this.byText.set(persona.decisionText, result.outputs);
    }
  }

  private recorded(decisionText: string, key: string): unknown {
    const output = this.byText.get(decisionText)?.[key];
    if (output === undefined) throw new Error(`The report has no "${key}" output for this persona`);
    return output;
  }

  private usage(step: AiStep, pathId: string | null): AiUsageRecord {
    return {
      step,
      pathId,
      provider: 'fixture',
      model: 'replay',
      promptVersion: 'replay',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      at: new Date().toISOString(),
    };
  }

  analyzeIntake(input: IntakeInput): Promise<AiCallResult<IntakeResult>> {
    return Promise.resolve({
      output: this.recorded(input.decisionText, 'intake') as IntakeResult,
      usage: this.usage('intake', null),
    });
  }

  buildModel(input: BuildModelInput): Promise<AiCallResult<ModelOutput>> {
    return Promise.resolve({
      output: this.recorded(input.decisionText, 'model') as ModelOutput,
      usage: this.usage('model', null),
    });
  }

  writeNarrative(input: NarrativeInput): Promise<AiCallResult<PathNarrative>> {
    const pathId = input.facts.path.id;
    return Promise.resolve({
      output: this.recorded(input.decisionText, `narrative:${pathId}`) as PathNarrative,
      usage: this.usage('narrative', pathId),
    });
  }
}
