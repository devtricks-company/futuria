import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  type AiStep,
  type AiUsageRecord,
  type IntakeResult,
  type PathNarrative,
  intakeResultSchema,
  pathNarrativeSchema,
} from '@futuria/shared';
import { AiError } from './ai.errors.js';
import type {
  AiCallResult,
  AiProvider,
  BuildModelInput,
  IntakeInput,
  NarrativeInput,
} from './ai.types.js';
import { type ModelOutput, modelOutputSchemaFor } from './model-output.schema.js';
import { costUsd } from './pricing.js';
import {
  CAREER_LEAP_SYSTEM,
  STEP_PROMPTS,
  intakeUserMessage,
  modelUserMessage,
  narrativeUserMessage,
} from './prompts/index.js';

export const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface AnthropicProviderOptions {
  model: string;
  /** Server-side refusal fallback (beta). */
  refusalFallback: boolean;
  /** cache_control on the system prompt blocks. */
  promptCache: boolean;
}

/** How hard Claude thinks per step. Opus 5.5 defaults to medium; we set it explicitly. */
const EFFORT: Record<AiStep, 'low' | 'medium' | 'high'> = {
  intake: 'medium',
  model: 'medium',
  narrative: 'medium',
};

const MAX_TOKENS = 16_000;

/** Map SDK errors to AiError, most specific first. */
export function mapSdkError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('rate_limited', 'Claude rate limit', true, error.message);
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.NotFoundError
  ) {
    return new AiError(
      'misconfigured',
      `Claude API rejected the credentials, URL or model`,
      false,
      error.message,
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    // A gateway that doesn't support a feature (beta header, output_config) also lands here.
    return new AiError('misconfigured', 'Claude API rejected the request', false, error.message);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError('unavailable', 'Could not reach the Claude API', true, error.message);
  }
  if (error instanceof Anthropic.APIError) {
    // 5xx, 529 overloaded, 408/409 after the SDK's own retries.
    return new AiError(
      'unavailable',
      `Claude API error ${error.status ?? ''}`.trim(),
      true,
      error.message,
    );
  }
  // Structured-output parsing or validation failed (AnthropicError, SyntaxError, ZodError).
  return new AiError(
    'invalid_output',
    'Claude returned output that failed validation',
    true,
    String(error),
  );
}

/** Extract a JSON object from a text reply (tolerates code fences or stray prose around it). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SyntaxError('no JSON object in the reply');
  return JSON.parse(body.slice(start, end + 1));
}

const issuesText = (error: z.ZodError) =>
  error.issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

type BetaMessage = Anthropic.Beta.BetaMessage;

/**
 * Real Claude calls, directly or through a gateway.
 * - intake and narrative: messages.parse with a Zod output format (grammar-constrained output).
 * - model: the decision model is too large for a constrained-output grammar (the API answers
 *   "compiled grammar is too large" from two paths up), so Claude gets the JSON Schema in the
 *   prompt and replies with JSON, validated with the same Zod schema, with one correction round.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly kind = 'anthropic' as const;
  private readonly logger = new Logger(AnthropicAiProvider.name);

  constructor(
    private readonly client: Anthropic,
    private readonly options: AnthropicProviderOptions,
  ) {}

  analyzeIntake(input: IntakeInput): Promise<AiCallResult<IntakeResult>> {
    return this.structured('intake', null, intakeResultSchema, intakeUserMessage(input));
  }

  buildModel(input: BuildModelInput): Promise<AiCallResult<ModelOutput>> {
    const schema = modelOutputSchemaFor(input.paths.map((p) => p.type));
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
    return this.validatedJson('model', schema, modelUserMessage(input, jsonSchema)) as Promise<
      AiCallResult<ModelOutput>
    >;
  }

  writeNarrative(input: NarrativeInput): Promise<AiCallResult<PathNarrative>> {
    return this.structured(
      'narrative',
      input.facts.path.id,
      pathNarrativeSchema,
      narrativeUserMessage(input),
    );
  }

  /** One request with the shared conventions; SDK errors are mapped to AiError. */
  private async request(
    step: AiStep,
    messages: Anthropic.Beta.BetaMessageParam[],
    format?: ReturnType<typeof betaZodOutputFormat>,
  ): Promise<BetaMessage & { parsed_output?: unknown }> {
    const cache = this.options.promptCache ? { cache_control: { type: 'ephemeral' as const } } : {};
    const params = {
      model: this.options.model,
      max_tokens: MAX_TOKENS,
      // Stable domain prompt first, then step rules: both cacheable; user data last.
      system: [
        { type: 'text' as const, text: CAREER_LEAP_SYSTEM, ...cache },
        { type: 'text' as const, text: STEP_PROMPTS[step].instructions, ...cache },
      ],
      messages,
      ...(this.options.refusalFallback
        ? { betas: [REFUSAL_FALLBACK_BETA], fallbacks: 'default' as const }
        : {}),
    };
    try {
      return format
        ? await this.client.beta.messages.parse({
            ...params,
            output_config: { effort: EFFORT[step], format },
          })
        : await this.client.beta.messages.create({
            ...params,
            output_config: { effort: EFFORT[step] },
          });
    } catch (error) {
      const mapped = mapSdkError(error);
      this.logger.warn(`${step} call failed: ${mapped.code} (${mapped.detail ?? mapped.message})`);
      throw mapped;
    }
  }

  /** Refusal and truncation checks, always before reading any output. */
  private checkStop(step: AiStep, response: BetaMessage): void {
    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category ?? 'unspecified';
      throw new AiError(
        'refusal',
        `Claude declined the ${step} request`,
        false,
        `category: ${category}`,
      );
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AiError('max_tokens', `The ${step} response hit max_tokens`, true);
    }
  }

  private async structured<S extends z.ZodType>(
    step: AiStep,
    pathId: string | null,
    schema: S,
    userContent: string,
  ): Promise<AiCallResult<z.output<S>>> {
    const started = Date.now();
    const response = await this.request(
      step,
      [{ role: 'user', content: userContent }],
      betaZodOutputFormat(schema),
    );
    const usage = this.usageRecord(step, pathId, [response], Date.now() - started);
    this.checkStop(step, response);
    const parsed = response.parsed_output;
    if (parsed === null || parsed === undefined) {
      throw new AiError(
        'invalid_output',
        `The ${step} response had no parsed output`,
        true,
        response.stop_reason ?? '',
      );
    }
    return { output: parsed as z.output<S>, usage };
  }

  private async validatedJson<S extends z.ZodType>(
    step: AiStep,
    schema: S,
    userContent: string,
  ): Promise<AiCallResult<z.output<S>>> {
    const started = Date.now();
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userContent }];
    const responses: BetaMessage[] = [];
    let problem = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await this.request(step, messages);
      responses.push(response);
      this.checkStop(step, response);
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      try {
        const result = schema.safeParse(extractJson(text));
        if (result.success) {
          const usage = this.usageRecord(step, null, responses, Date.now() - started);
          return { output: result.data as z.output<S>, usage };
        }
        problem = issuesText(result.error);
      } catch (error) {
        problem = `- the reply was not a JSON object (${(error as Error).message})`;
      }
      this.logger.warn(`${step} JSON attempt ${attempt} failed validation:\n${problem}`);
      // Keep the whole assistant turn (thinking included) and ask for a corrected object.
      messages.push(
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: `That JSON does not match the schema:\n${problem}\nReply with the complete, corrected JSON object only.`,
        },
      );
    }
    this.usageRecord(step, null, responses, Date.now() - started);
    throw new AiError('invalid_output', `The ${step} JSON failed validation twice`, true, problem);
  }

  /** One usage record per logical call; a correction round adds its tokens to the same record. */
  private usageRecord(
    step: AiStep,
    pathId: string | null,
    responses: BetaMessage[],
    durationMs: number,
  ): AiUsageRecord {
    const sum = (pick: (u: Anthropic.Beta.BetaUsage) => number | null) =>
      responses.reduce((total, r) => total + (pick(r.usage) ?? 0), 0);
    const tokens = {
      inputTokens: sum((u) => u.input_tokens),
      outputTokens: sum((u) => u.output_tokens),
      cacheReadInputTokens: sum((u) => u.cache_read_input_tokens),
      cacheCreationInputTokens: sum((u) => u.cache_creation_input_tokens),
    };
    const last = responses.at(-1)!;
    const usage: AiUsageRecord = {
      step,
      pathId,
      provider: 'anthropic',
      model: last.model,
      promptVersion: STEP_PROMPTS[step].version,
      ...tokens,
      costUsd: costUsd(last.model, tokens),
      durationMs,
      at: new Date().toISOString(),
    };
    this.logger.log(
      `${step}${pathId ? `:${pathId}` : ''} ${last.model} stop=${last.stop_reason} ` +
        `calls=${responses.length} in=${tokens.inputTokens} out=${tokens.outputTokens} ` +
        `cacheRead=${tokens.cacheReadInputTokens} cacheWrite=${tokens.cacheCreationInputTokens} ` +
        `cost=$${usage.costUsd ?? '?'} ${durationMs}ms`,
    );
    return usage;
  }
}
