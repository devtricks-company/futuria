import { z } from 'zod';
import { DEFAULT_DATABASE, databaseName, isMongoUri, withDatabase } from '../database/mongo-uri.js';

/** "true"/"false"/"1"/"0" (any case) as a boolean, with a default when unset or empty. */
const flag = (fallback: boolean) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return fallback;
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      ctx.addIssue({ code: 'custom', message: 'must be true, false, 1 or 0' });
      return z.NEVER;
    });

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

/** Environment variables, validated at startup. Defaults suit local development. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated browser origins allowed by CORS (and Clerk authorized parties). */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** MongoDB Atlas (`mongodb+srv://`) or local (`mongodb://`). No database name means "futuria". */
  MONGODB_URI: z
    .string()
    .trim()
    .refine(isMongoUri, 'must be a mongodb:// or mongodb+srv:// connection string')
    .transform((uri) => (databaseName(uri) ? uri : withDatabase(uri, DEFAULT_DATABASE)))
    .default(`mongodb://127.0.0.1:27017/${DEFAULT_DATABASE}`),
  /** "clerk" verifies Clerk session tokens; "dev" trusts an x-dev-user header (never in production). */
  AUTH_MODE: z.enum(['clerk', 'dev']).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  /** Optional PEM public key for networkless Clerk token verification. */
  CLERK_JWT_KEY: z.string().min(1).optional(),

  /*
   * Claude. "anthropic" calls the Messages API (directly or through a gateway at
   * ANTHROPIC_BASE_URL); "fixture" returns recorded or synthetic output and never calls the API.
   */
  AI_MODE: z.enum(['anthropic', 'fixture']).optional(),
  /** API key, sent as x-api-key. */
  ANTHROPIC_API_KEY: optionalSecret,
  /** Alternative credential, sent as Authorization: Bearer (some gateways expect this). */
  ANTHROPIC_AUTH_TOKEN: optionalSecret,
  /** Gateway or proxy root, without /v1. Unset means https://api.anthropic.com. */
  ANTHROPIC_BASE_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value?.replace(/\/+$/, '') || undefined)
    .pipe(z.url({ protocol: /^https?$/ }).optional()),
  AI_MODEL: z.string().trim().min(1).default('claude-opus-5-5'),
  /** Server-side refusal fallback (beta). Turn off if a gateway rejects the beta header. */
  AI_REFUSAL_FALLBACK: flag(true),
  /** Prompt caching on the system prompt. Turn off if a gateway rejects cache_control. */
  AI_PROMPT_CACHE: flag(true),

  /*
   * Run pipeline. "inngest" sends an event to Inngest (Dev Server locally, Inngest Cloud in
   * production); "inline" runs the same steps in-process (tests, quick local runs).
   */
  PIPELINE_MODE: z.enum(['inngest', 'inline']).optional(),
  /** "1" talks to a local Inngest Dev Server (npx inngest-cli@latest dev). */
  INNGEST_DEV: flag(false),
  INNGEST_EVENT_KEY: optionalSecret,
  INNGEST_SIGNING_KEY: optionalSecret,

  /*
   * Billing. "stripe" sells Pro and Premium through Stripe Checkout; "disabled" (no keys: local
   * dev, CI) answers checkout with 503 billing_disabled. Production requires Stripe.
   */
  BILLING_MODE: z.enum(['stripe', 'disabled']).optional(),
  STRIPE_SECRET_KEY: optionalSecret,
  /** Signing secret of the webhook endpoint (`stripe listen` prints one for local testing). */
  STRIPE_WEBHOOK_SECRET: optionalSecret,
});

type ParsedEnv = z.output<typeof envSchema>;

export type Env = Omit<ParsedEnv, 'AUTH_MODE' | 'AI_MODE' | 'PIPELINE_MODE' | 'BILLING_MODE'> & {
  AUTH_MODE: 'clerk' | 'dev';
  AI_MODE: 'anthropic' | 'fixture';
  PIPELINE_MODE: 'inngest' | 'inline';
  BILLING_MODE: 'stripe' | 'disabled';
  WEB_ORIGINS: string[];
};

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  const production = env.NODE_ENV === 'production';

  const authMode = env.AUTH_MODE ?? (env.CLERK_SECRET_KEY || env.CLERK_JWT_KEY ? 'clerk' : 'dev');
  if (authMode === 'dev' && production) {
    throw new Error('AUTH_MODE=dev is not allowed in production. Set CLERK_SECRET_KEY.');
  }
  if (authMode === 'clerk' && !env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) {
    throw new Error('AUTH_MODE=clerk requires CLERK_SECRET_KEY or CLERK_JWT_KEY.');
  }

  const hasClaudeCredential = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const aiMode = env.AI_MODE ?? (hasClaudeCredential ? 'anthropic' : 'fixture');
  if (aiMode === 'fixture' && production) {
    throw new Error('AI_MODE=fixture is not allowed in production. Set ANTHROPIC_API_KEY.');
  }
  if (aiMode === 'anthropic' && !hasClaudeCredential) {
    throw new Error('AI_MODE=anthropic requires ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.');
  }

  const pipelineMode =
    env.PIPELINE_MODE ?? (env.INNGEST_DEV || env.INNGEST_EVENT_KEY ? 'inngest' : 'inline');
  if (pipelineMode === 'inline' && production) {
    throw new Error('PIPELINE_MODE=inline is not allowed in production. Configure Inngest.');
  }
  if (pipelineMode === 'inngest' && !env.INNGEST_DEV) {
    if (!env.INNGEST_EVENT_KEY || !env.INNGEST_SIGNING_KEY) {
      throw new Error(
        'PIPELINE_MODE=inngest needs INNGEST_DEV=1 (local Dev Server) or INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.',
      );
    }
  }

  const billingMode = env.BILLING_MODE ?? (env.STRIPE_SECRET_KEY ? 'stripe' : 'disabled');
  if (billingMode === 'disabled' && production) {
    throw new Error('BILLING_MODE=disabled is not allowed in production. Set STRIPE_SECRET_KEY.');
  }
  if (billingMode === 'stripe' && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)) {
    throw new Error('BILLING_MODE=stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
  }

  return {
    ...env,
    AUTH_MODE: authMode,
    AI_MODE: aiMode,
    PIPELINE_MODE: pipelineMode,
    BILLING_MODE: billingMode,
    WEB_ORIGINS: env.WEB_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
