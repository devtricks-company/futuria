import { describe, expect, it } from 'vitest';
import { FIELD_LABELS } from './field-labels';
import { FIELD_META, isFractionUnit, metaForField } from './field-meta';
import { milestoneMonths } from './results';

describe('field metadata', () => {
  it('covers every labelled field, and only those', () => {
    expect(Object.keys(FIELD_META).sort()).toEqual(Object.keys(FIELD_LABELS).sort());
  });

  it('has bounds in order', () => {
    for (const [field, meta] of Object.entries(FIELD_META)) {
      expect(meta.min, field).toBeLessThan(meta.max);
    }
  });

  it('keeps fraction fields within plausible fraction bounds', () => {
    for (const [field, meta] of Object.entries(FIELD_META)) {
      if (isFractionUnit(meta.unit)) expect(Math.abs(meta.max), field).toBeLessThanOrEqual(1);
    }
  });

  it('resolves nested field paths by their last segment', () => {
    expect(metaForField('freelance.hourlyRate')).toEqual(FIELD_META.hourlyRate);
    expect(metaForField('baseline.startingCash')?.unit).toBe('money');
    expect(metaForField('nope')).toBeUndefined();
  });
});

describe('milestoneMonths', () => {
  it('uses 1/3/6/9/12 and always ends at the horizon', () => {
    expect(milestoneMonths(12)).toEqual([1, 3, 6, 9, 12]);
    expect(milestoneMonths(24)).toEqual([1, 3, 6, 9, 12, 18, 24]);
    expect(milestoneMonths(7)).toEqual([1, 3, 6, 7]);
  });
});
