import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { AnthropicAiProvider } from './anthropic-ai.provider.js';
import type { AiProvider } from './ai.types.js';
import { FixtureAiProvider } from './fixture-ai.provider.js';

/** Request timeout per Claude call; the SDK retries 429/5xx and connection errors twice. */
const TIMEOUT_MS = 180_000;

export type AiEnv = Pick<
  Env,
  | 'AI_MODE'
  | 'AI_MODEL'
  | 'AI_REFUSAL_FALLBACK'
  | 'AI_PROMPT_CACHE'
  | 'ANTHROPIC_API_KEY'
  | 'ANTHROPIC_AUTH_TOKEN'
  | 'ANTHROPIC_BASE_URL'
>;

/** An Anthropic client for the configured endpoint (Anthropic or a gateway) and credential. */
export function createAnthropicClient(
  env: Pick<AiEnv, 'ANTHROPIC_API_KEY' | 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_BASE_URL'>,
  overrides: { credential?: 'apiKey' | 'authToken' } = {},
): Anthropic {
  const secret = env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_AUTH_TOKEN ?? null;
  // Exactly one credential: an API key (x-api-key) wins over a bearer token, unless overridden.
  const useBearer = overrides.credential
    ? overrides.credential === 'authToken'
    : !env.ANTHROPIC_API_KEY;
  return new Anthropic({
    ...(useBearer ? { apiKey: null, authToken: secret } : { apiKey: secret, authToken: null }),
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
    timeout: TIMEOUT_MS,
    maxRetries: 2,
  });
}

/** The AiProvider for AI_MODE: real Claude calls, or recorded/synthetic fixtures. */
export function createAiProvider(env: AiEnv, logger = new Logger('AiModule')): AiProvider {
  if (env.AI_MODE === 'fixture') {
    logger.log('AI_MODE=fixture: recorded or synthetic AI output, no API calls.');
    return new FixtureAiProvider();
  }
  const options = {
    model: env.AI_MODEL,
    refusalFallback: env.AI_REFUSAL_FALLBACK,
    promptCache: env.AI_PROMPT_CACHE,
  };
  logger.log(
    `AI_MODE=anthropic: ${options.model} via ${env.ANTHROPIC_BASE_URL ?? 'api.anthropic.com'} ` +
      `(refusal fallback ${options.refusalFallback ? 'on' : 'off'}, ` +
      `prompt cache ${options.promptCache ? 'on' : 'off'})`,
  );
  return new AnthropicAiProvider(createAnthropicClient(env), options);
}
