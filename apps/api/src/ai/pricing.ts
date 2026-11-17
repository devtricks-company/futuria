/**
 * List prices in USD per million tokens (Anthropic first-party API). Cache writes use the 5-minute
 * TTL rate (1.25 × input). If calls go through a gateway that bills differently, costs computed
 * here are estimates: compare them with the gateway's own billing.
 */
interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  // Possible server-side refusal fallbacks.
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

/** Estimated cost of one call, or null when the model has no known price. */
export function costUsd(model: string, usage: TokenUsage): number | null {
  // Gateways sometimes prefix or suffix model ids (e.g. "anthropic/claude-opus-5-5").
  const price =
    PRICES[model] ?? Object.entries(PRICES).find(([id]) => model.includes(id))?.[1] ?? null;
  if (!price) return null;
  const cost =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheReadInputTokens * price.cacheRead +
    usage.cacheCreationInputTokens * price.cacheWrite;
  return Number((cost / 1e6).toFixed(6));
}
