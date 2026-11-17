import type {
  AiUsageRecord,
  IntakeAnswer,
  IntakeResult,
  PathNarrative,
  ProposedPath,
} from '@futuria/shared';
import type { ModelOutput } from './model-output.schema.js';
import type { NarrativeFacts } from './narrative-facts.js';

/** Injection token for the active AiProvider (chosen by AI_MODE). */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiCallResult<T> {
  output: T;
  usage: AiUsageRecord;
}

export interface IntakeInput {
  decisionText: string;
}

export interface BuildModelInput {
  decisionText: string;
  intake: IntakeResult;
  answers: Record<string, IntakeAnswer>;
  paths: ProposedPath[];
  horizonMonths: number;
}

export interface NarrativeInput {
  decisionText: string;
  facts: NarrativeFacts;
}

/**
 * The three Claude calls. Implementations: AnthropicAiProvider (real API, directly or through a
 * gateway) and FixtureAiProvider (recorded or synthetic output for tests, CI and offline work).
 * Claude never produces final numbers: buildModel proposes inputs that the API clamps and the
 * engine simulates; writeNarrative only narrates engine output.
 */
export interface AiProvider {
  readonly kind: 'anthropic' | 'fixture';
  analyzeIntake(input: IntakeInput): Promise<AiCallResult<IntakeResult>>;
  buildModel(input: BuildModelInput): Promise<AiCallResult<ModelOutput>>;
  writeNarrative(input: NarrativeInput): Promise<AiCallResult<PathNarrative>>;
}
