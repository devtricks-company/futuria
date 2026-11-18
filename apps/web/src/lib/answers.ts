import {
  type IntakeAnswer,
  type IntakeQuestion,
  PROFILE_INFORMS,
  type Profile,
} from '@futuria/shared';

/*
 * Intake answers in the wizard. Inputs edit "drafts" (strings for numbers, so a half-typed value
 * is allowed); they become typed answers on submit. Percent questions show 25 for 0.25.
 *
 * Unchanged defaults must round-trip to exactly the same value: fixture mode replays a recorded
 * model only for an exact match, and it keeps answers stable for the real API too.
 */

export type AnswerDraft = string | boolean;

const NUMERIC_KINDS = new Set(['money', 'months', 'hours', 'percent', 'number']);

export function isNumericKind(kind: IntakeQuestion['kind']): boolean {
  return NUMERIC_KINDS.has(kind);
}

/** Avoid float noise in percent display: 0.07 -> "7", not "7.000000000000001". */
const tidy = (n: number) => String(Math.round(n * 1e6) / 1e6);

export function draftFromValue(question: IntakeQuestion, value: IntakeAnswer | null): AnswerDraft {
  if (question.kind === 'boolean') return value === true;
  if (value === null || value === undefined) return '';
  if (isNumericKind(question.kind) && typeof value === 'number') {
    return question.kind === 'percent' ? tidy(value * 100) : tidy(value);
  }
  return String(value);
}

export interface ParsedAnswer {
  /** Undefined when the question was left empty. */
  value?: IntakeAnswer;
  error?: string;
}

export function answerFromDraft(question: IntakeQuestion, draft: AnswerDraft): ParsedAnswer {
  if (question.kind === 'boolean') return { value: draft === true };
  const text = typeof draft === 'string' ? draft.trim() : '';
  if (text === '') return {};
  if (isNumericKind(question.kind)) {
    const n = Number(text.replace(/[,\s]/g, ''));
    if (!Number.isFinite(n)) return { error: 'Enter a number' };
    if (question.kind !== 'number' && question.kind !== 'percent' && n < 0) {
      return { error: 'Enter zero or more' };
    }
    if (question.kind === 'percent') {
      if (n < -100 || n > 100) return { error: 'Enter a percentage between -100 and 100' };
      return { value: n / 100 };
    }
    return { value: n };
  }
  if (question.kind === 'choice' && question.options.length && !question.options.includes(text)) {
    return { error: 'Pick one of the options' };
  }
  return { value: text.slice(0, 500) };
}

/**
 * Starting drafts: the saved answer, else the person's profile (for money questions it informs),
 * else Claude's default.
 */
export function initialDrafts(
  questions: IntakeQuestion[],
  saved: Record<string, IntakeAnswer> | null,
  profile: Profile | null,
): Record<string, AnswerDraft> {
  const drafts: Record<string, AnswerDraft> = {};
  for (const q of questions) {
    if (saved && q.id in saved) {
      drafts[q.id] = draftFromValue(q, saved[q.id]!);
      continue;
    }
    const profileKey = q.informs ? PROFILE_INFORMS[q.informs] : undefined;
    const profileValue = profileKey && profile ? profile[profileKey] : null;
    if (q.kind === 'money' && typeof profileValue === 'number') {
      drafts[q.id] = draftFromValue(q, profileValue);
      continue;
    }
    drafts[q.id] = draftFromValue(q, q.defaultValue);
  }
  return drafts;
}

/** Ids of questions whose starting value came from the profile (to label them). */
export function profileFilled(
  questions: IntakeQuestion[],
  saved: Record<string, IntakeAnswer> | null,
  profile: Profile | null,
): Set<string> {
  const ids = new Set<string>();
  if (!profile) return ids;
  for (const q of questions) {
    if (saved && q.id in saved) continue;
    const key = q.informs ? PROFILE_INFORMS[q.informs] : undefined;
    if (q.kind === 'money' && key && typeof profile[key] === 'number') ids.add(q.id);
  }
  return ids;
}

/** A draft as shown back to the person: "4,000", "25%", "22 hours", "Yes". */
export function describeDraft(question: IntakeQuestion, draft: AnswerDraft): string {
  if (question.kind === 'boolean') return draft === true ? 'Yes' : 'No';
  const text = typeof draft === 'string' ? draft.trim() : '';
  if (text === '' || !isNumericKind(question.kind)) return text;
  const n = Number(text.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return text;
  const shown = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  switch (question.kind) {
    case 'percent':
      return `${shown}%`;
    case 'hours':
      return `${shown} ${n === 1 ? 'hour' : 'hours'}`;
    case 'months':
      return `${shown} ${n === 1 ? 'month' : 'months'}`;
    default:
      return shown;
  }
}

/** Whether a draft differs from where it started (ignoring surrounding spaces). */
export function draftChanged(draft: AnswerDraft, initial: AnswerDraft): boolean {
  if (typeof draft === 'boolean' || typeof initial === 'boolean') return draft !== initial;
  return draft.trim() !== initial.trim();
}

/** The first question (by position) that has an error, or -1. */
export function firstErrorIndex(
  questions: IntakeQuestion[],
  errors: Record<string, string>,
): number {
  return questions.findIndex((q) => q.id in errors);
}

export function collectAnswers(
  questions: IntakeQuestion[],
  drafts: Record<string, AnswerDraft>,
): { answers: Record<string, IntakeAnswer>; errors: Record<string, string> } {
  const answers: Record<string, IntakeAnswer> = {};
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const parsed = answerFromDraft(q, drafts[q.id] ?? '');
    if (parsed.error) errors[q.id] = parsed.error;
    else if (parsed.value !== undefined) answers[q.id] = parsed.value;
  }
  return { answers, errors };
}
