import { Logger } from '@nestjs/common';
import type { z } from 'zod';
import {
  type AiStep,
  type IntakeResult,
  type PathNarrative,
  intakeResultSchema,
  pathNarrativeSchema,
} from '@futuria/shared';
import type {
  AiCallResult,
  AiProvider,
  BuildModelInput,
  IntakeInput,
  NarrativeInput,
} from './ai.types.js';
import { readFixture } from './fixture-store.js';
import { type ModelOutput, modelOutputSchemaFor } from './model-output.schema.js';
import { STEP_PROMPTS } from './prompts/index.js';
import { syntheticIntake, syntheticModel, syntheticNarrative } from './synthetic.js';

/**
 * AI_MODE=fixture: replays a recorded Claude output when one matches the input exactly, else
 * returns a deterministic synthetic output. Never calls the API and costs nothing.
 */
export class FixtureAiProvider implements AiProvider {
  readonly kind = 'fixture' as const;
  private readonly logger = new Logger(FixtureAiProvider.name);

  analyzeIntake(input: IntakeInput): Promise<AiCallResult<IntakeResult>> {
    return this.answer('intake', null, input, intakeResultSchema, () =>
      syntheticIntake(input.decisionText),
    );
  }

  buildModel(input: BuildModelInput): Promise<AiCallResult<ModelOutput>> {
    const schema = modelOutputSchemaFor(input.paths.map((p) => p.type));
    return this.answer('model', null, input, schema, () => syntheticModel(input)) as Promise<
      AiCallResult<ModelOutput>
    >;
  }

  writeNarrative(input: NarrativeInput): Promise<AiCallResult<PathNarrative>> {
    return this.answer('narrative', input.facts.path.id, input, pathNarrativeSchema, () =>
      syntheticNarrative(input.facts),
    );
  }

  private answer<S extends z.ZodType>(
    step: AiStep,
    pathId: string | null,
    input: unknown,
    schema: S,
    synthesize: () => z.output<S>,
  ): Promise<AiCallResult<z.output<S>>> {
    const started = Date.now();
    const recording = readFixture(step, input);
    let output: z.output<S>;
    if (recording) {
      output = schema.parse(recording.output);
      this.logger.debug(`${step}: replayed recording ${recording.key}`);
    } else {
      output = synthesize();
    }
    return Promise.resolve({
      output,
      usage: {
        step,
        pathId,
        provider: 'fixture',
        model: recording ? `fixture:${recording.model}` : 'fixture:synthetic',
        promptVersion: recording?.promptVersion ?? STEP_PROMPTS[step].version,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUsd: 0,
        durationMs: Date.now() - started,
        at: new Date().toISOString(),
      },
    });
  }
}
