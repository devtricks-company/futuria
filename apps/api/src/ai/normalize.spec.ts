import type { IntakeQuestion, IntakeResult } from '@futuria/shared';
import { AiError } from './ai.errors.js';
import { normalizeIntake, slugify } from './normalize.js';

const question = (id: string, extra: Partial<IntakeQuestion> = {}): IntakeQuestion => ({
  id,
  prompt: `Question ${id}?`,
  kind: 'money',
  helpText: null,
  options: ['should be dropped'],
  defaultValue: 100,
  informs: null,
  ...extra,
});

const base: IntakeResult = {
  inScope: true,
  category: 'freelance',
  safetyFlag: 'none',
  title: 'Go freelance',
  questions: [question('a')],
  proposedPaths: [
    { id: 'stay', name: 'Stay', type: 'stay', summary: '' },
    { id: 'freelance', name: 'Freelance', type: 'freelance', summary: '' },
  ],
};

describe('normalizeIntake', () => {
  it('caps questions at 7 and paths at 3, with safe unique ids', () => {
    const result = normalizeIntake(
      {
        ...base,
        questions: Array.from({ length: 10 }, (_, i) => question(i < 2 ? 'Same Id!' : `q${i}`)),
        proposedPaths: [
          ...base.proposedPaths,
          { id: 'Hybrid Path', name: 'Hybrid', type: 'hybrid', summary: '' },
          { id: 'startup', name: 'Startup', type: 'startup', summary: '' },
        ],
      },
      'decision',
    );
    expect(result.questions).toHaveLength(7);
    expect(result.questions.slice(0, 2).map((q) => q.id)).toEqual(['same-id', 'same-id-2']);
    expect(result.questions[0]!.options).toEqual([]); // only "choice" questions keep options
    expect(result.proposedPaths.map((p) => p.id)).toEqual(['stay', 'freelance', 'hybrid-path']);
  });

  it('adds the status quo when only one path was proposed, and rejects none', () => {
    const one = normalizeIntake({ ...base, proposedPaths: [base.proposedPaths[1]!] }, 'd');
    expect(one.proposedPaths.map((p) => p.type)).toEqual(['stay', 'freelance']);
    expect(() =>
      normalizeIntake({ ...base, proposedPaths: [base.proposedPaths[0]!] }, 'd'),
    ).toThrow(AiError);
  });

  it('strips questions and paths from out-of-scope and crisis intakes', () => {
    const crisis = normalizeIntake({ ...base, safetyFlag: 'crisis', title: '' }, 'Help me decide');
    expect(crisis).toMatchObject({ questions: [], proposedPaths: [], title: 'Help me decide' });
  });

  it('slugifies ids', () => {
    expect(slugify('New Job!', 'x')).toBe('new-job');
    expect(slugify('---', 'fallback')).toBe('fallback');
    expect(slugify('a'.repeat(50), 'x')).toHaveLength(32);
  });
});
