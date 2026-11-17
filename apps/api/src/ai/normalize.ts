import {
  INTAKE_LIMITS,
  type IntakeQuestion,
  type IntakeResult,
  type ProposedPath,
  intakeRouting,
} from '@futuria/shared';
import { AiError } from './ai.errors.js';

const text = (value: string | null | undefined, max: number) => (value ?? '').trim().slice(0, max);

/** A path or question id the API can store and route safely: [a-z0-9][a-z0-9_-]{0,31}. */
export function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+/, '')
    .slice(0, 32)
    .replace(/[-_]+$/, '');
  return slug || fallback;
}

function uniqueIds<T extends { id: string }>(items: T[], fallbackPrefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item, i) => {
    let id = slugify(item.id, `${fallbackPrefix}-${i + 1}`);
    if (seen.has(id)) id = `${id.slice(0, 28)}-${i + 1}`;
    seen.add(id);
    return { ...item, id };
  });
}

function normalizeQuestion(q: IntakeQuestion): IntakeQuestion {
  const isChoice = q.kind === 'choice';
  return {
    ...q,
    prompt: text(q.prompt, 300),
    helpText: q.helpText ? text(q.helpText, 300) : null,
    options: isChoice
      ? q.options
          .map((o) => text(o, 80))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    defaultValue: typeof q.defaultValue === 'string' ? text(q.defaultValue, 200) : q.defaultValue,
    informs: q.informs ?? null,
  };
}

const STAY_PATH: ProposedPath = {
  id: 'stay',
  name: 'Stay where you are',
  type: 'stay',
  summary: 'Keep your current job: the baseline every other path is compared with.',
};

/**
 * Enforce the intake limits Claude's structured output can't: at most 7 questions, 2-3 paths,
 * safe unique ids and bounded text. Out-of-scope and crisis intakes carry no questions or paths.
 */
export function normalizeIntake(result: IntakeResult, decisionText: string): IntakeResult {
  const title = text(result.title, 80) || text(decisionText, 80);
  if (intakeRouting(result) !== 'ok') {
    return { ...result, title, questions: [], proposedPaths: [] };
  }

  const questions = uniqueIds(result.questions, 'q')
    .slice(0, INTAKE_LIMITS.maxQuestions)
    .map(normalizeQuestion)
    .filter((q) => q.prompt);

  let paths = result.proposedPaths.map((p) => ({
    ...p,
    name: text(p.name, 80) || p.type,
    summary: text(p.summary, 300),
  }));
  if (paths.length < INTAKE_LIMITS.minPaths && !paths.some((p) => p.type === 'stay')) {
    paths = [STAY_PATH, ...paths];
  }
  paths = uniqueIds(paths, 'path').slice(0, INTAKE_LIMITS.maxPaths);
  if (paths.length < INTAKE_LIMITS.minPaths) {
    throw new AiError('invalid_output', 'The intake proposed fewer than two paths', true);
  }

  return { ...result, title, questions, proposedPaths: paths };
}
