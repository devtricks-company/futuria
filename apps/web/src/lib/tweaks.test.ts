import { describe, expect, it } from 'vitest';
import { SARA_MODEL, decisionModelSchema, range } from '@futuria/shared';
import { simulate } from '@futuria/engine';
import { activeTweaks, applyTweaks, slidersFor, tweakedValue } from './tweaks';

const model = decisionModelSchema.parse({
  ...SARA_MODEL,
  assumptions: [
    {
      id: 'rate',
      pathId: 'freelance',
      field: 'hourlyRate',
      label: 'Rate',
      rationale: 'Typical for a senior UX designer.',
      source: 'ai_estimate',
      confidence: 'medium',
    },
  ],
});
const all = slidersFor(model).flatMap((g) => g.sliders);
const byId = (id: string) => all.find((s) => s.id === id)!;

describe('slidersFor', () => {
  it('offers savings and expenses for every path, plus path-specific levers', () => {
    const groups = slidersFor(model);
    expect(groups[0]!.sliders.map((s) => s.field)).toEqual([
      'baseline.startingCash',
      'baseline.monthlyExpenses',
    ]);
    expect(groups.map((g) => g.pathId)).toEqual([null, 'freelance', 'hybrid']); // stay has none
    expect(byId('hybrid:freelance.hourlyRate').label).toBe('Hourly rate');
  });

  it('keeps each slider range around the current value, inside plausible bounds', () => {
    for (const s of all) {
      expect(s.min, s.id).toBeLessThanOrEqual(s.base);
      expect(s.max, s.id).toBeGreaterThanOrEqual(s.base);
      expect(s.step, s.id).toBeGreaterThan(0);
    }
    expect(byId('freelance:hourlyRate').min).toBeGreaterThanOrEqual(5);
  });
});

describe('tweakedValue', () => {
  it('scales money ranges and shifts month ranges', () => {
    const rate = byId('freelance:hourlyRate');
    const scaled = tweakedValue(range(50, 60, 70), { ...rate, base: 60, mode: 'scale' }, 66);
    expect(scaled).toEqual({
      kind: 'range',
      low: expect.closeTo(55, 6),
      likely: expect.closeTo(66, 6),
      high: expect.closeTo(77, 6),
    });
    const months = byId('freelance:monthsToFirstClient');
    expect(tweakedValue(range(1, 2, 5), { ...months, base: 2, mode: 'shift' }, 0)).toEqual(
      range(0, 0, 3),
    );
  });
});

describe('applyTweaks', () => {
  it('ignores sliders left at their value', () => {
    expect(applyTweaks(model, {})).toBe(model);
    expect(activeTweaks({ 'baseline:baseline.startingCash': 18000 }, all)).toEqual({});
  });

  it('changes only the tweaked fields and keeps the model valid', () => {
    const next = applyTweaks(model, { 'baseline:baseline.startingCash': 30000 });
    expect(next.baseline.startingCash).toBe(30000);
    expect(next.paths).toEqual(model.paths);
    expect(decisionModelSchema.safeParse(next).success).toBe(true);
  });

  it('more savings lowers the chance of running out (same seed)', () => {
    const before = simulate(model, { seed: 7, runs: 400 }).paths.find(
      (p) => p.pathId === 'freelance',
    )!;
    const tweaked = applyTweaks(model, { 'baseline:baseline.startingCash': 36000 });
    const after = simulate(tweaked, { seed: 7, runs: 400 }).paths.find(
      (p) => p.pathId === 'freelance',
    )!;
    expect(after.metrics.probRunOut).toBeLessThanOrEqual(before.metrics.probRunOut);
  });

  it('marks tweaked assumptions as the person’s own when saving', () => {
    const next = applyTweaks(model, { 'freelance:hourlyRate': 80 }, { markAsUser: true });
    expect(next.assumptions[0]!.source).toBe('user');
    expect(applyTweaks(model, { 'freelance:hourlyRate': 80 }).assumptions[0]!.source).toBe(
      'ai_estimate',
    );
  });
});
