/*
 * Runs before each e2e test file: point the app at a throwaway futuria_test_* database and use
 * dev auth. Each file gets its own database, which the file drops when it finishes.
 *
 * The server is MONGODB_TEST_URI from the environment (CI) or apps/api/.env, for example an Atlas
 * cluster. Without it, tests use the local MongoDB. Tests never read MONGODB_URI, so they can't
 * touch the app database.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { withDatabase } from '../src/database/mongo-uri.js';

function testServerUri(): string {
  if (process.env.MONGODB_TEST_URI) return process.env.MONGODB_TEST_URI;
  const envFile = resolve(import.meta.dirname, '../.env');
  const fromFile = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8')).MONGODB_TEST_URI
    : undefined;
  return fromFile || 'mongodb://127.0.0.1:27017';
}

const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

process.env.MONGODB_URI = withDatabase(testServerUri().trim(), `futuria_test_${suffix}`);
process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'dev';
