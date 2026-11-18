/*
 * FUTURIA AI eval: runs every persona through intake -> model -> engine -> narrative and checks
 * schema validity, plausible ranges, use of the person's answers, no guarantee language,
 * grounded narrative figures, and out-of-scope / crisis routing. Reports cost per simulation.
 *
 *   pnpm --filter @futuria/api eval --yes          # real Claude: costs money (~$10)
 *   pnpm --filter @futuria/api eval --fixture      # free dry run of the harness itself
 *   ... --only sara-freelance-ux,oos-house         # a subset
 *   ... --concurrency 2
 *   pnpm --filter @futuria/api eval --replay evals/results/<file>.json   # re-score saved outputs
 *
 * Run it manually before any prompt change. CI never runs it. Exit code 1 if a hard check fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze } from '@futuria/engine';
import {
  type AiUsageRecord,
  type IntakeAnswer,
  type IntakeResult,
  type PathNarrative,
  intakeRouting,
} from '@futuria/shared';
import { FixtureAiProvider } from '../src/ai/fixture-ai.provider.js';
import { AiError } from '../src/ai/ai.errors.js';
import type { AiProvider } from '../src/ai/ai.types.js';
import { assembleModel } from '../src/ai/clamps.js';
import { ungroundedFigures } from '../src/ai/grounding.js';
import { buildNarrativeFacts } from '../src/ai/narrative-facts.js';
import { normalizeIntake } from '../src/ai/normalize.js';
import { PROMPT_SET_VERSION } from '../src/ai/prompts/index.js';
import { createAiProvider } from '../src/ai/provider-factory.js';
import { hasFlag, loadEnv, option } from '../scripts/lib/env.js';
import { PERSONAS, type Persona } from './personas.js';
import { ReplayAiProvider } from './replay-provider.js';

const FIXTURE = hasFlag('fixture');
/** Re-score the outputs saved in an earlier report (free): --replay evals/results/<file>.json */
const REPLAY = option('replay');
const MODE = REPLAY ? 'replay' : FIXTURE ? 'fixture' : 'real';
const SEED = 20261117;
const HORIZON = 12;

/**
 * Promises, certainty and "risk-free" claims the narrative must never make. Contract terms such
 * as "guaranteed minimum" or "guaranteed pay" are fine: they describe a deal, not an outcome.
 */
const GUARANTEE =
  /\b(guarantee[ds]?(?!\s+(?:minimum|pay|hours|income|base|salary|rate|retainer)s?\b)|certainly will|definitely will|will definitely|will certainly|risk[- ]free|100% (?:safe|sure|certain)|can(?:'|no)t fail|no risk)\b/i;

/**
 * Telling the person to ask about a guarantee ("Ask whether there is a draw, base or guarantee")
 * names a deal term to check, not a promise. Only the asked-about mention is removed, up to the
 * first "guarantee", so a promise later in the same text is still caught.
 */
const ASKED_ABOUT_GUARANTEE =
  /\b(?:ask|check|find out|confirm|negotiate)\b[^.!?;]*?\bguarantee[ds]?\b/gi;

const promisesOutcome = (text: string) => GUARANTEE.test(text.replace(ASKED_ABOUT_GUARANTEE, ''));

interface CheckResult {
  name: string;
  hard: boolean;
  ok: boolean;
  detail?: string;
}

interface PersonaResult {
  id: string;
  routing: string;
  checks: CheckResult[];
  usage: AiUsageRecord[];
  costUsd: number;
  error?: string;
  /** Claude's outputs, kept in the JSON report for review (not printed). */
  outputs: Record<string, unknown>;
}

function answerFor(
  question: IntakeResult['questions'][number],
  persona: Persona,
): IntakeAnswer | undefined {
  const field = question.informs?.split('.').pop();
  const fact = field ? persona.facts?.[field] : undefined;
  if (fact !== undefined) return fact;
  return question.defaultValue ?? undefined;
}

function narrativeTexts(n: PathNarrative): string[] {
  return [
    ...Object.values(n.scenarios).flatMap((ms) =>
      ms.flatMap((m) => [m.headline, ...m.events, ...m.opportunities, ...m.challenges, ...m.risks]),
    ),
    ...n.actionPlan.flatMap((a) => [a.title, a.why, ...a.steps]),
  ];
}

async function evaluate(ai: AiProvider, persona: Persona): Promise<PersonaResult> {
  const checks: CheckResult[] = [];
  const usage: AiUsageRecord[] = [];
  const outputs: Record<string, unknown> = {};
  const check = (name: string, ok: boolean, hard = true, detail?: string) =>
    checks.push({ name, hard, ok, detail });
  const result = (routing: string, error?: string): PersonaResult => ({
    id: persona.id,
    routing,
    checks,
    usage,
    costUsd: usage.reduce((sum, u) => sum + (u.costUsd ?? 0), 0),
    error,
    outputs,
  });

  try {
    // Intake
    const intake = await ai.analyzeIntake({ decisionText: persona.decisionText });
    usage.push(intake.usage);
    outputs.intake = intake.output;
    const raw = intake.output;
    check('intake: schema-valid output', true);
    const routing = intakeRouting(raw);
    check(
      `routing is ${persona.expect.routing}`,
      routing === persona.expect.routing,
      true,
      routing,
    );
    if (routing !== 'ok' || persona.expect.routing !== 'ok') return result(routing);

    if (persona.expect.category) {
      check(
        `category in [${persona.expect.category.join(', ')}]`,
        persona.expect.category.includes(raw.category),
        false,
        raw.category,
      );
    }
    check(
      'intake: 5-7 questions',
      raw.questions.length >= 5 && raw.questions.length <= 7,
      false,
      String(raw.questions.length),
    );
    check(
      'intake: 2-3 paths',
      raw.proposedPaths.length >= 2 && raw.proposedPaths.length <= 3,
      false,
      String(raw.proposedPaths.length),
    );
    const informs = new Set(raw.questions.map((q) => q.informs?.split('.').pop()));
    check(
      'intake: asks savings, expenses and take-home pay',
      ['startingCash', 'monthlyExpenses', 'currentMonthlyNetSalary'].every((f) => informs.has(f)),
      false,
      [...informs].join(', '),
    );
    const normalized = normalizeIntake(raw, persona.decisionText);

    // Model
    const answers: Record<string, IntakeAnswer> = {};
    for (const q of normalized.questions) {
      const answer = answerFor(q, persona);
      if (answer !== undefined) answers[q.id] = answer;
    }
    const paths = normalized.proposedPaths;
    const built = await ai.buildModel({
      decisionText: persona.decisionText,
      intake: normalized,
      answers,
      paths,
      horizonMonths: HORIZON,
    });
    usage.push(built.usage);
    outputs.model = built.output;
    const { model, adjustments } = assembleModel(built.output, { paths, horizonMonths: HORIZON });
    check('model: valid after clamps', true);
    check(
      'model: no clamps needed',
      adjustments.length === 0,
      false,
      adjustments.slice(0, 4).join('; '),
    );
    const savings = persona.facts?.startingCash;
    if (typeof savings === 'number' && Object.values(answers).includes(savings)) {
      check(
        'model: uses the stated savings',
        Math.abs(model.baseline.startingCash - savings) <= Math.max(1, savings * 0.01),
        true,
        String(model.baseline.startingCash),
      );
    }
    check(
      'model: estimates carry rationales',
      model.assumptions.some((a) => a.source === 'ai_estimate' && a.rationale.length > 10),
      false,
    );

    // Engine + narrative (one call per path, in parallel like the pipeline)
    const analysis = analyze(model, { seed: SEED });
    const stories = await Promise.all(
      model.paths.map(async (path) => {
        const facts = buildNarrativeFacts(model, analysis, path.id);
        const story = await ai.writeNarrative({ decisionText: persona.decisionText, facts });
        usage.push(story.usage);
        outputs[`narrative:${path.id}`] = story.output;
        return { path, facts, narrative: story.output };
      }),
    );
    for (const { path, facts, narrative } of stories) {
      const months = (key: keyof PathNarrative['scenarios']) =>
        narrative.scenarios[key].map((m) => m.month).join(',');
      check(
        `${path.id}: milestones at the given months`,
        (['optimistic', 'realistic', 'pessimistic'] as const).every(
          (k) => months(k) === facts.milestoneMonths.join(','),
        ),
        true,
        months('realistic'),
      );
      const ungrounded = ungroundedFigures(narrative, facts);
      // Show each flagged figure in its sentence, so prompt problems are easy to see.
      const where = ungrounded.map(
        (figure) => narrativeTexts(narrative).find((t) => t.includes(figure)) ?? figure,
      );
      check(
        `${path.id}: figures grounded in engine numbers`,
        ungrounded.length === 0,
        true,
        ungrounded.length ? `${ungrounded.join(', ')} in: ${[...new Set(where)].join(' | ')}` : '',
      );
      const promises = narrativeTexts(narrative).filter(promisesOutcome);
      check(`${path.id}: no guarantee language`, promises.length === 0, true, promises[0]);
      const ids = new Set(facts.interventions.map((i) => i.id));
      check(
        `${path.id}: action plan cites real interventions`,
        narrative.actionPlan.length >= 1 &&
          narrative.actionPlan.every((a) => a.interventionId === null || ids.has(a.interventionId)),
        true,
        narrative.actionPlan.map((a) => a.interventionId).join(','),
      );
    }
    return result(routing);
  } catch (error) {
    const message =
      error instanceof AiError ? `${error.code}: ${error.detail ?? error.message}` : String(error);
    check('completed without errors', false, true, message);
    return result('error', message);
  }
}

async function runPool<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

const only = option('only')?.split(',');
const personas = only ? PERSONAS.filter((p) => only.includes(p.id)) : PERSONAS;
if (personas.length === 0) {
  console.error(`No personas match --only ${only?.join(',')}`);
  process.exit(1);
}

const env = loadEnv();
const ai: AiProvider = REPLAY
  ? new ReplayAiProvider(REPLAY)
  : FIXTURE
    ? new FixtureAiProvider()
    : createAiProvider({ ...env, AI_MODE: 'anthropic' });
if (MODE === 'real' && !hasFlag('yes')) {
  const inScope = personas.filter((p) => p.expect.routing === 'ok').length;
  console.log(
    `This calls Claude (${env.AI_MODEL} via ${env.ANTHROPIC_BASE_URL ?? 'api.anthropic.com'}) for ${personas.length} personas: ` +
      `${inScope} full simulations at about $0.35-0.45 each plus ${personas.length - inScope} intakes.\n` +
      'Re-run with --yes to spend that, --fixture for a free dry run, or --replay <report> to re-score saved outputs.',
  );
  process.exit(0);
}

console.log(
  `Running ${personas.length} personas (${MODE === 'real' ? env.AI_MODEL : MODE}, prompts ${PROMPT_SET_VERSION})...\n`,
);
const started = Date.now();
const results = await runPool(personas, Number(option('concurrency') ?? 3), async (persona) => {
  const r = await evaluate(ai, persona);
  const failedHard = r.checks.filter((c) => c.hard && !c.ok);
  console.log(
    `${failedHard.length ? 'FAIL' : 'pass'}  ${persona.id.padEnd(28)} ${r.routing.padEnd(12)} ` +
      `$${r.costUsd.toFixed(3)}${failedHard.length ? `  ${failedHard.map((c) => `${c.name} [${c.detail ?? ''}]`).join('; ')}` : ''}`,
  );
  return r;
});

// Summary
const hardFailures = results.filter((r) => r.checks.some((c) => c.hard && !c.ok));
const softChecks = results.flatMap((r) => r.checks.filter((c) => !c.hard));
const fullSims = results.filter((r) => r.routing === 'ok' && !r.error);
const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
const perSim = fullSims.length ? fullSims.reduce((s, r) => s + r.costUsd, 0) / fullSims.length : 0;
const allUsage = results.flatMap((r) => r.usage);
const sum = (key: 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens') =>
  allUsage.reduce((s, u) => s + u[key], 0);
const byStep = (step: AiUsageRecord['step']) => {
  const calls = allUsage.filter((u) => u.step === step);
  return calls.length ? calls.reduce((s, u) => s + (u.costUsd ?? 0), 0) / calls.length : 0;
};

console.log(
  `\n${results.length - hardFailures.length}/${results.length} personas passed every hard check.`,
);
console.log(
  `Soft checks: ${softChecks.filter((c) => c.ok).length}/${softChecks.length} passed ` +
    `(${[...new Set(softChecks.filter((c) => !c.ok).map((c) => c.name.replace(/^\w+: /, '')))].join('; ') || 'none failed'}).`,
);
console.log(
  `Cost: $${totalCost.toFixed(2)} total; $${perSim.toFixed(3)} per full simulation ` +
    `(intake $${byStep('intake').toFixed(3)}, model $${byStep('model').toFixed(3)}, narrative $${byStep('narrative').toFixed(3)} per path).`,
);
console.log(
  `Tokens: ${sum('inputTokens')} in, ${sum('outputTokens')} out, ${sum('cacheReadInputTokens')} cache reads. ` +
    `${Math.round((Date.now() - started) / 1000)}s.`,
);

const dir = resolve(import.meta.dirname, 'results');
mkdirSync(dir, { recursive: true });
const file = resolve(
  dir,
  `${new Date().toISOString().replace(/[:.]/g, '-')}${MODE === 'real' ? '' : `-${MODE}`}.json`,
);
writeFileSync(
  file,
  JSON.stringify(
    {
      promptVersion: PROMPT_SET_VERSION,
      model: MODE === 'real' ? env.AI_MODEL : MODE,
      totalCost,
      perSim,
      results,
    },
    null,
    2,
  ),
);
console.log(`Report: ${file}`);
process.exit(hardFailures.length ? 1 : 0);
