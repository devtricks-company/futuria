import { z } from 'zod';
import { DEFAULT_DATABASE, databaseName, isMongoUri, withDatabase } from '../database/mongo-uri.js';

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
});

export type Env = Omit<z.output<typeof envSchema>, 'AUTH_MODE'> & {
  AUTH_MODE: 'clerk' | 'dev';
  WEB_ORIGINS: string[];
};

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  const authMode = env.AUTH_MODE ?? (env.CLERK_SECRET_KEY || env.CLERK_JWT_KEY ? 'clerk' : 'dev');

  if (authMode === 'dev' && env.NODE_ENV === 'production') {
    throw new Error('AUTH_MODE=dev is not allowed in production. Set CLERK_SECRET_KEY.');
  }
  if (authMode === 'clerk' && !env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) {
    throw new Error('AUTH_MODE=clerk requires CLERK_SECRET_KEY or CLERK_JWT_KEY.');
  }

  return {
    ...env,
    AUTH_MODE: authMode,
    WEB_ORIGINS: env.WEB_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
