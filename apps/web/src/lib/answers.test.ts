import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type IntakeQuestion } from '@futuria/shared';
import {
  answerFromDraft,
  collectAnswers,
  draftFromValue,
  initialDrafts,
  profileFilled,
} from './answers';

const q = (overrides: Partial<IntakeQuestion>): IntakeQuestion => ({
  id: 'q',
  prompt: 'Question?',
  kind: 'number',
  helpText: null,
  options: [],
  defaultValue: null,
  informs: null,
  ...overrides,
});

const savings = q({
  id: 'savings',
  kind: 'money',
  defaultValue: 15000,
  informs: 'baseline.startingCash',
});
const tax = q({ id: 'tax', kind: 'percent', defaultValue: 0.07 });
const leads = q({
  id: 'leads',
  kind: 'choice',
  options: ['None', 'Some contacts but nothing concrete'],
  defaultValue: 'Some contacts but nothing concrete',
});
const back = q({ id: 'back', kind: 'boolean', defaultValue: null });
const notes = q({ id: 'notes', kind: 'text' });

describe('intake answer drafts', () => {
  it('round-trips every default exactly (fixture replay depends on it)', () => {
    const questions = [savings, tax, leads];
    const drafts = initialDrafts(questions, null, null);
    expect(drafts).toEqual({
      savings: '15000',
      tax: '7',
      leads: 'Some contacts but nothing concrete',
    });
    expect(collectAnswers(questions, drafts)).toEqual({
      answers: { savings: 15000, tax: 0.07, leads: 'Some contacts but nothing concrete' },
      errors: {},
    });
  });

  it('shows percents as whole numbers without float noise', () => {
    expect(draftFromValue(tax, 0.07)).toBe('7');
    expect(answerFromDraft(tax, '12.5')).toEqual({ value: 0.125 });
    expect(answerFromDraft(tax, '150').error).toBeDefined();
  });

  it('parses numbers with separators and rejects bad input', () => {
    expect(answerFromDraft(savings, '18,000')).toEqual({ value: 18000 });
    expect(answerFromDraft(savings, 'lots').error).toBe('Enter a number');
    expect(answerFromDraft(savings, '-5').error).toBe('Enter zero or more');
    expect(answerFromDraft(savings, '  ')).toEqual({});
  });

  it('treats booleans as answered and empty text as skipped', () => {
    expect(draftFromValue(back, null)).toBe(false);
    expect(collectAnswers([back, notes], { back: true, notes: '' })).toEqual({
      answers: { back: true },
      errors: {},
    });
  });

  it('only accepts listed choices', () => {
    expect(answerFromDraft(leads, 'Maybe').error).toBe('Pick one of the options');
  });

  it('pre-fills money questions from the profile, but saved answers win', () => {
    const profile = { ...EMPTY_PROFILE, savings: 18000 };
    expect(initialDrafts([savings], null, profile)).toEqual({ savings: '18000' });
    expect(profileFilled([savings], null, profile)).toEqual(new Set(['savings']));
    expect(initialDrafts([savings], { savings: 20000 }, profile)).toEqual({ savings: '20000' });
    expect(profileFilled([savings], { savings: 20000 }, profile).size).toBe(0);
    // An empty profile value falls back to Claude's default.
    expect(initialDrafts([savings], null, EMPTY_PROFILE)).toEqual({ savings: '15000' });
  });
});
