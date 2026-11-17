import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Env, validateEnv } from '../../src/config/env.js';

/** apps/api/.env (if present) on top of the process environment, validated like the app does. */
export function loadEnv(): Env {
  const file = resolve(import.meta.dirname, '../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
  return validateEnv(process.env);
}

export const hasFlag = (name: string) => process.argv.includes(`--${name}`);

export function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}
