/*
 * Gateway probe: checks, one feature at a time, whether the configured Claude endpoint
 * (ANTHROPIC_BASE_URL, or api.anthropic.com) supports what FUTURIA's AI layer relies on.
 *
 *   pnpm --filter @futuria/api ai:probe
 *
 * Makes about 7 small requests (a few cents). Prints a table and the env settings to use.
 * Exit code 1 if a required feature is missing.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { REFUSAL_FALLBACK_BETA } from '../src/ai/anthropic-ai.provider.js';
import { costUsd } from '../src/ai/pricing.js';
import { CAREER_LEAP_SYSTEM, STEP_PROMPTS } from '../src/ai/prompts/index.js';
import { createAnthropicClient } from '../src/ai/provider-factory.js';
import { loadEnv } from './lib/env.js';

const env = loadEnv();
if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) {
  console.error('Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) in apps/api/.env first.');
  process.exit(1);
}
const model = env.AI_MODEL;
const endpoint = env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';

interface Check {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
let spent = 0;

function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `HTTP ${error.status ?? '?'}: ${error.message.slice(0, 160)}`;
  }
  return (error as Error).message?.slice(0, 160) ?? String(error);
}

function track(response: { model: string; usage: Anthropic.Usage | Anthropic.Beta.BetaUsage }) {
  spent +=
    costUsd(response.model, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    }) ?? 0;
}

async function check(
  name: string,
  required: boolean,
  run: () => Promise<string>,
): Promise<boolean> {
  try {
    const detail = await run();
    checks.push({ name, required, ok: true, detail });
    return true;
  } catch (error) {
    checks.push({ name, required, ok: false, detail: describeError(error) });
    return false;
  }
}

console.log(`Probing ${endpoint} with model ${model}\n`);

// 1. Messages API + credential header. Try the configured header, then the other one.
const preferred = env.ANTHROPIC_API_KEY ? 'apiKey' : 'authToken';
let client = createAnthropicClient(env, { credential: preferred });
const ping = () =>
  client.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
  });
let credential: 'apiKey' | 'authToken' = preferred;
let basic = await check('Messages API (/v1/messages) and credentials', true, async () => {
  const r = await ping();
  track(r);
  return `${preferred === 'apiKey' ? 'x-api-key' : 'Bearer'} accepted; served by ${r.model}`;
});
if (!basic) {
  const other = preferred === 'apiKey' ? 'authToken' : 'apiKey';
  client = createAnthropicClient(env, { credential: other });
  basic = await check(
    `...retry with ${other === 'apiKey' ? 'x-api-key' : 'Bearer'} header`,
    true,
    async () => {
      const r = await ping();
      track(r);
      credential = other;
      return `works with ${other === 'apiKey' ? 'x-api-key' : 'Authorization: Bearer'}; served by ${r.model}`;
    },
  );
}

if (basic) {
  // 2. Usage reporting, needed for cost measurement.
  await check('Usage reported (input, output, cache fields)', true, async () => {
    const r = await ping();
    track(r);
    const u = r.usage as unknown as Record<string, unknown>;
    const missing = ['input_tokens', 'output_tokens', 'cache_read_input_tokens'].filter(
      (k) => !(k in u),
    );
    if (typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') {
      throw new Error(`usage is incomplete: ${JSON.stringify(u)}`);
    }
    return missing.length
      ? `ok, but missing ${missing.join(', ')}`
      : `in=${u.input_tokens} out=${u.output_tokens}`;
  });

  // 3. Effort.
  await check('output_config.effort', true, async () => {
    const r = await client.messages.create({
      model,
      max_tokens: 256,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    track(r);
    return 'accepted';
  });

  // 4. Structured outputs via messages.parse.
  const Probe = z.object({ answer: z.number(), unit: z.string() });
  await check('Structured outputs (messages.parse + zod)', true, async () => {
    const r = await client.messages.parse({
      model,
      max_tokens: 1024,
      output_config: { effort: 'low', format: zodOutputFormat(Probe) },
      messages: [{ role: 'user', content: 'How many months are in a year? unit: "months".' }],
    });
    track(r);
    if (!r.parsed_output) throw new Error(`no parsed output (stop_reason ${r.stop_reason})`);
    return `parsed ${JSON.stringify(r.parsed_output)}`;
  });

  // 5. Server-side refusal fallback (beta).
  await check(`Refusal fallback beta (${REFUSAL_FALLBACK_BETA})`, false, async () => {
    const r = await client.beta.messages.create({
      model,
      max_tokens: 256,
      betas: [REFUSAL_FALLBACK_BETA],
      fallbacks: 'default',
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    track(r);
    return 'accepted';
  });

  // 6. Prompt caching with the real system prompt: the second identical request should read it.
  await check('Prompt caching on the FUTURIA system prompt', false, async () => {
    const request = () =>
      client.messages.create({
        model,
        max_tokens: 256,
        system: [
          { type: 'text', text: CAREER_LEAP_SYSTEM, cache_control: { type: 'ephemeral' } },
          {
            type: 'text',
            text: STEP_PROMPTS.intake.instructions,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      });
    const first = await request();
    track(first);
    const second = await request();
    track(second);
    const read = second.usage.cache_read_input_tokens ?? 0;
    const prefix =
      first.usage.input_tokens +
      (first.usage.cache_creation_input_tokens ?? 0) +
      (first.usage.cache_read_input_tokens ?? 0);
    if (read === 0) {
      throw new Error(
        `no cache read on the repeat request (prefix ~${prefix} tokens). The gateway may strip cache_control, or the prefix is below the model's minimum cacheable length.`,
      );
    }
    return `repeat request read ${read} cached tokens`;
  });
}

const width = Math.max(...checks.map((c) => c.name.length)) + 2;
console.log(`${'Check'.padEnd(width)}Result`);
console.log('-'.repeat(width + 60));
for (const c of checks) {
  const mark = c.ok ? 'ok  ' : c.required ? 'FAIL' : 'no  ';
  console.log(`${c.name.padEnd(width)}${mark}  ${c.detail}`);
}
console.log(`\nApproximate cost of this probe: $${spent.toFixed(4)}`);

const fallbackOk = checks.find((c) => c.name.startsWith('Refusal fallback'))?.ok ?? false;
const cacheOk = checks.find((c) => c.name.startsWith('Prompt caching'))?.ok ?? false;
const requiredFailed = checks.filter((c) => c.required && !c.ok && !c.name.startsWith('...'));
const credentialRecovered = checks.some((c) => c.name.startsWith('...') && c.ok);

console.log('\nSuggested apps/api/.env settings:');
if (credential !== preferred || credentialRecovered) {
  console.log(
    credential === 'authToken'
      ? '  ANTHROPIC_AUTH_TOKEN=<your key>   (and remove ANTHROPIC_API_KEY)'
      : '  ANTHROPIC_API_KEY=<your key>      (and remove ANTHROPIC_AUTH_TOKEN)',
  );
}
console.log(`  AI_REFUSAL_FALLBACK=${fallbackOk}`);
console.log(
  `  AI_PROMPT_CACHE=${cacheOk}${cacheOk ? '' : '   (harmless to leave on if the gateway accepts it)'}`,
);

const blocking = requiredFailed.filter(
  (c) => !(credentialRecovered && c.name.startsWith('Messages API')),
);
if (blocking.length > 0) {
  console.error(
    `\nRequired features missing: ${blocking.map((c) => c.name).join('; ')}. FUTURIA's AI layer needs them; see the details above.`,
  );
  process.exit(1);
}
console.log('\nThe endpoint supports everything FUTURIA requires.');
