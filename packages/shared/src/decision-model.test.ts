import { describe, expect, it } from 'vitest';
import { decisionModelSchema } from './decision-model';
import { fixed, likelyValue, range, scaleDistribution } from './distribution';
import { labelForField } from './field-labels';
import { SARA_MODEL } from './fixtures/sara';
import { PLANS } from './plans';

describe('decisionModelSchema', () => {
  it('parses the Sara fixture and applies defaults', () => {
    const model = decisionModelSchema.parse(SARA_MODEL);
    expect(model.paths.map((p) => p.type)).toEqual(['stay', 'freelance', 'hybrid']);
    const freelance = model.paths[1]!;
    if (freelance.type !== 'freelance') throw new Error('expected freelance');
    expect(freelance.revenueVolatility).toBe(0.15);
  });

  it('fills defaults for a minimal model', () => {
    const model = decisionModelSchema.parse({
      baseline: { startingCash: 1000, monthlyExpenses: fixed(500) },
      paths: [{ id: 'stay', name: 'Stay', type: 'stay' }],
    });
    expect(model.horizonMonths).toBe(12);
    expect(model.baseline.currency).toBe('USD');
    expect(model.assumptions).toEqual([]);
  });

  it('rejects duplicate path ids, unknown types and bad probabilities', () => {
    const base = { baseline: { startingCash: 0, monthlyExpenses: fixed(1) } };
    expect(
      decisionModelSchema.safeParse({
        ...base,
        paths: [
          { id: 'a', name: 'A', type: 'stay' },
          { id: 'a', name: 'B', type: 'stay' },
        ],
      }).success,
    ).toBe(false);
    expect(
      decisionModelSchema.safeParse({ ...base, paths: [{ id: 'a', name: 'A', type: 'lottery' }] })
        .success,
    ).toBe(false);
    expect(
      decisionModelSchema.safeParse({
        ...base,
        paths: [{ id: 'a', name: 'A', type: 'stay', annualLayoffProb: 1.5 }],
      }).success,
    ).toBe(false);
  });
});

describe('distribution helpers', () => {
  it('scales and reads the most likely value', () => {
    expect(scaleDistribution(range(10, 20, 30), 2)).toEqual(range(20, 40, 60));
    expect(likelyValue(range(1, 2, 3))).toBe(2);
    expect(likelyValue(fixed(7))).toBe(7);
  });
});

describe('labels and plans', () => {
  it('labels nested fields by their last segment', () => {
    expect(labelForField('freelance.hourlyRate')).toBe('Hourly rate');
    expect(labelForField('baseline.monthlyExpenses')).toBe('Monthly living expenses');
  });

  it('keeps plan limits increasing with price', () => {
    expect(PLANS.free.simulations).toBe(3);
    expect(PLANS.pro.maxHorizonMonths).toBeGreaterThan(PLANS.free.maxHorizonMonths);
    expect(PLANS.business.maxPaths).toBeGreaterThanOrEqual(PLANS.premium.maxPaths);
  });
});
