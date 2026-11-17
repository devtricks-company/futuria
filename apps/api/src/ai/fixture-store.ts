import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { AiStep } from '@futuria/shared';

/*
 * Recorded Claude outputs for AI_MODE=fixture, stored as apps/api/fixtures/ai/<step>/<key>.json.
 * The key is a hash of the step and its input, so the same input replays the same recording.
 * Recordings are made from real runs (scripts/record-fixtures.ts) and committed.
 */

/** apps/api/fixtures/ai, from both src/ai (tests, tsx) and dist/ai (built app). */
export const FIXTURES_DIR = resolve(import.meta.dirname, '../../fixtures/ai');

export interface FixtureRecording {
  step: AiStep;
  key: string;
  recordedAt: string;
  model: string;
  promptVersion: string;
  input: unknown;
  output: unknown;
}

/** JSON with object keys sorted, so equal inputs hash equally regardless of key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fixtureKey(step: AiStep, input: unknown): string {
  return createHash('sha256')
    .update(`${step}\n${stableStringify(input)}`)
    .digest('hex')
    .slice(0, 16);
}

function fixturePath(step: AiStep, key: string): string {
  return resolve(FIXTURES_DIR, step, `${key}.json`);
}

export function readFixture(step: AiStep, input: unknown): FixtureRecording | null {
  const file = fixturePath(step, fixtureKey(step, input));
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as FixtureRecording) : null;
}

export function writeFixture(recording: Omit<FixtureRecording, 'key'>): string {
  const key = fixtureKey(recording.step, recording.input);
  const file = fixturePath(recording.step, key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...recording, key }, null, 2)}\n`);
  return file;
}
