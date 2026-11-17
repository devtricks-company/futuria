import { describe, expect, it } from 'vitest';
import { type Assumption, SARA_MODEL, decisionModelSchema, range } from '@futuria/shared';
import { countEstimates, groupFields, setFieldValue, validateValue } from './model-fields';
import { newPathId, pathsChanged } from './paths';

const assumption = (overrides: Partial<Assumption>): Assumption => ({
  id: 'a1',
  pathId: null,
  field: 'baseline.startingCash',
  label: 'Savings',
  rationale: 'You told us.',
  source: 'user',
  confidence: 'high',
  ...overrides,
});

const model = decisionModelSchema.parse({
  ...SARA_MODEL,
  assumptions: [
    assumption({ id: 'cash' }),
    assumption({ id: 'currency', field: 'baseline.currency', source: 'default' }),
    assumption({ id: 'rate', pathId: 'freelance', field: 'hourlyRate', source: 'ai_estimate' }),
    // Claude left out the "freelance." prefix on the hybrid path: matched by last segment.
    assumption({ id: 'hybrid-rate', pathId: 'hybrid', field: 'hourlyRate', source: 'ai_estimate' }),
    assumption({ id: 'odd', pathId: 'freelance', field: 'vibes', source: 'ai_estimate' }),
  ],
});

describe('groupFields', () => {
  const groups = groupFields(model);

  it('groups baseline first, then each path', () => {
    expect(groups.map((g) => g.pathId)).toEqual([null, 'stay', 'freelance', 'hybrid']);
    expect(groups[0]!.fields.map((f) => f.field)).toContain('baseline.startingCash');
    expect(groups[0]!.fields.find((f) => f.field === 'baseline.currency')?.label).toBe('Currency');
  });

  it('attaches assumptions by exact field, or by a unique last segment', () => {
    const freelance = groups.find((g) => g.pathId === 'freelance')!;
    expect(freelance.fields.find((f) => f.field === 'hourlyRate')?.assumption?.id).toBe('rate');
    const hybrid = groups.find((g) => g.pathId === 'hybrid')!;
    expect(hybrid.fields.find((f) => f.field === 'freelance.hourlyRate')?.assumption?.id).toBe(
      'hybrid-rate',
    );
  });

  it('keeps unmatched assumptions as notes', () => {
    expect(groups.find((g) => g.pathId === 'freelance')!.notes.map((a) => a.id)).toEqual(['odd']);
  });

  it('counts AI estimates attached to fields', () => {
    expect(countEstimates(groups)).toBe(2);
  });
});

describe('setFieldValue', () => {
  it('changes the value and marks its assumption as the person’s own', () => {
    const field = groupFields(model)
      .find((g) => g.pathId === 'freelance')!
      .fields.find((f) => f.field === 'hourlyRate')!;
    const next = setFieldValue(model, field, range(60, 75, 90));
    const path = next.paths.find((p) => p.id === 'freelance');
    expect(path?.type === 'freelance' && path.hourlyRate).toEqual(range(60, 75, 90));
    expect(next.assumptions.find((a) => a.id === 'rate')?.source).toBe('user');
    // The original model is untouched.
    expect(model.assumptions.find((a) => a.id === 'rate')?.source).toBe('ai_estimate');
  });

  it('edits baseline fields', () => {
    const next = setFieldValue(
      model,
      { pathId: null, field: 'baseline.startingCash', assumption: undefined },
      20000,
    );
    expect(next.baseline.startingCash).toBe(20000);
  });
});

describe('validateValue', () => {
  const rateMeta = { unit: 'moneyPerHour', min: 5, max: 500 } as const;
  it('accepts sensible values', () => {
    expect(validateValue(range(40, 60, 80), rateMeta)).toBeNull();
    expect(validateValue('EUR', undefined)).toBeNull();
    expect(validateValue(true, undefined)).toBeNull();
  });
  it('rejects unordered ranges, out-of-bounds and bad codes', () => {
    expect(validateValue(range(80, 60, 90), rateMeta)).toMatch(/low/);
    expect(validateValue(1000, rateMeta)).toMatch(/between 5 and 500/);
    expect(validateValue(0.9, { unit: 'fraction', min: 0, max: 0.6 })).toMatch(/0% and 60%/);
    expect(validateValue('euro', undefined)).toMatch(/3-letter/);
    expect(validateValue(Number.NaN, undefined)).toBe('Enter a number');
  });
});

describe('paths', () => {
  it('makes unique ids per type', () => {
    expect(newPathId('freelance', [{ id: 'stay' }])).toBe('freelance');
    expect(newPathId('freelance', [{ id: 'freelance' }, { id: 'freelance-2' }])).toBe(
      'freelance-3',
    );
    expect(newPathId('newJob', [])).toBe('newjob');
  });
  it('detects edits', () => {
    const a = [{ id: 'stay', name: 'Stay', type: 'stay' as const, summary: '' }];
    expect(pathsChanged(a, [...a])).toBe(false);
    expect(pathsChanged(a, [{ ...a[0]!, name: 'Keep my job' }])).toBe(true);
    expect(pathsChanged(a, [])).toBe(true);
  });
});
