/*
 * Record real Claude outputs as AI_MODE=fixture recordings (apps/api/fixtures/ai/<step>/<key>.json).
 * Runs Sara's intake and model build with the default answers, so a fixture-mode walk through the
 * same steps (same decision, accepting the defaults) replays real output instead of synthetic.
 * Narratives depend on each simulation's random seed, so they stay synthetic in fixture mode.
 *
 *   pnpm --filter @futuria/api fixtures:record --yes      # two real calls (~$0.10-0.20)
 *   ... --decision "What if I quit my job to start a bakery?"
 */
import type { IntakeAnswer } from '@futuria/shared';
import { normalizeIntake } from '../src/ai/normalize.js';
import { createAiProvider } from '../src/ai/provider-factory.js';
import { writeFixture } from '../src/ai/fixture-store.js';
import { hasFlag, loadEnv, option } from './lib/env.js';

const decisionText =
  option('decision') ?? 'What if I quit my job to become a freelance UX designer?';
const env = loadEnv();
if (!hasFlag('yes')) {
  console.log(`This makes 2 real Claude calls for: "${decisionText}". Re-run with --yes.`);
  process.exit(0);
}
const ai = createAiProvider({ ...env, AI_MODE: 'anthropic' });

const intakeInput = { decisionText };
const intake = await ai.analyzeIntake(intakeInput);
console.log(
  'intake ->',
  writeFixture({
    step: 'intake',
    recordedAt: new Date().toISOString(),
    model: intake.usage.model,
    promptVersion: intake.usage.promptVersion,
    input: intakeInput,
    output: intake.output,
  }),
);

// The API normalizes the intake before the model step; record the model input it would send.
const normalized = normalizeIntake(intake.output, decisionText);
const answers: Record<string, IntakeAnswer> = {};
for (const q of normalized.questions) if (q.defaultValue !== null) answers[q.id] = q.defaultValue;
const modelInput = {
  decisionText,
  intake: normalized,
  answers,
  paths: normalized.proposedPaths,
  horizonMonths: 12,
};
const model = await ai.buildModel(modelInput);
console.log(
  'model  ->',
  writeFixture({
    step: 'model',
    recordedAt: new Date().toISOString(),
    model: model.usage.model,
    promptVersion: model.usage.promptVersion,
    input: modelInput,
    output: model.output,
  }),
);
const cost = (intake.usage.costUsd ?? 0) + (model.usage.costUsd ?? 0);
console.log(
  `Done. Cost about $${cost.toFixed(3)}. Commit the new files under apps/api/fixtures/ai.`,
);
