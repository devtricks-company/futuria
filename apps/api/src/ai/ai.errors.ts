import { HttpException } from '@nestjs/common';
import type { ApiErrorBody } from '@futuria/shared';

export type AiErrorCode =
  'refusal' | 'max_tokens' | 'invalid_output' | 'rate_limited' | 'unavailable' | 'misconfigured';

/** A Claude call that produced no usable output. `retryable` drives Inngest retries. */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const PUBLIC_MESSAGES: Record<AiErrorCode, string> = {
  refusal: 'The AI declined to help with this request.',
  max_tokens: 'The AI response was too long. Please try again.',
  invalid_output: 'The AI returned an unusable answer. Please try again.',
  rate_limited: 'The AI service is busy. Please try again in a minute.',
  unavailable: 'The AI service is unavailable right now. Please try again shortly.',
  misconfigured: 'The AI service is not configured correctly.',
};

/** Map an AiError to an HTTP error with the standard body (other errors pass through). */
export function toHttpError(error: unknown): unknown {
  if (!(error instanceof AiError)) return error;
  const status = error.code === 'refusal' ? 422 : error.code === 'rate_limited' ? 503 : 502;
  const body: ApiErrorBody = {
    statusCode: status,
    error:
      status === 422
        ? 'Unprocessable Entity'
        : status === 503
          ? 'Service Unavailable'
          : 'Bad Gateway',
    code: `ai_${error.code}`,
    message: PUBLIC_MESSAGES[error.code],
  };
  return new HttpException(body, status);
}

export function publicAiMessage(error: unknown): string {
  return error instanceof AiError ? PUBLIC_MESSAGES[error.code] : 'The simulation failed.';
}
