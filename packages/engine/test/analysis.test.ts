import { describe, expect, it } from 'vitest';
import { SARA_MODEL } from '@futuria/shared';
import { analyze } from '../src/analyze';
import { evaluateInterventions } from '../src/interventions';
import { getField, uncertainFields, withField } from '../src/model-utils';
import { analyzeSensitivity } from '../src/sensitivity';
import { parseModel } from '../src/simulate';

const SEED = 99;

describe('model utils', () => {
  const model = parseModel(SARA_MODEL);

  it('lists uncertain inputs per path, including nested and baseline fields', () => {
    expect(uncertainFields(model, 'freelance')).toEqual(
      expect.arrayContaining(['baseline.monthlyExpenses', 'hourlyRate', 'monthsToFirstClient']),
    );
    expect(uncertainFields(model, 'hybrid')).toEqual(
      expect.arrayContaining(['sideHoursPerWeek', 'freelance.hourlyRate']),
    );
    // Fixed values are not uncertain.
    expect(uncertainFields(model, 'hybrid')).not.toContain('transitionMonths');
  });

  it('reads and replaces fields without mutating the original', () => {
    const changed = withField(model, 'freelance', 'hourlyRate', { kind: 'fixed', value: 80 });
    expect(getField(changed, 'freelance', 'hourlyRate')).toEqual({ kind: 'fixed', value: 80 });
    expect(getField(model, 'freelance', 'hourlyRate')).toMatchObject({ kind: 'range' });
    expect(() => withField(model, 'freelance', 'nope', 1)).toThrow();
  });
});

describe('sensitivity', () => {
  const items = analyzeSensitivity(SARA_MODEL, 'freelance', { seed: SEED, runs: 300 });

  it('is sorted by swing with shares summing to ~1', () => {
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.swing).toBeGreaterThanOrEqual(items[i]!.swing);
    }
    const total = items.reduce((s, i) => s + i.share, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
  });

  it('shows a higher hourly rate leads to more cash', () => {
    const rate = items.find((i) => i.field === 'hourlyRate')!;
    expect(rate.high.medianCashAtHorizon).toBeGreaterThan(rate.low.medianCashAtHorizon);
    expect(rate.label).toBe('Hourly rate');
  });
});

describe('interventions', () => {
  const results = evaluateInterventions(SARA_MODEL, 'freelance', { seed: SEED, runs: 400 });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  it('only offers levers that apply to the path', () => {
    expect(Object.keys(byId).sort()).toEqual(
      [
        'cut_expenses_15',
        'go_hybrid',
        'land_first_client',
        'raise_rate_10',
        'save_more_first',
      ].sort(),
    );
    const stay = evaluateInterventions(SARA_MODEL, 'stay', { seed: SEED, runs: 100 });
    expect(stay.map((r) => r.id)).toEqual(['cut_expenses_15']);
  });

  it('never increases risk for levers that only add cash (common random numbers)', () => {
    for (const id of ['cut_expenses_15', 'save_more_first']) {
      expect(byId[id]!.after.probRunOut).toBeLessThanOrEqual(byId[id]!.before.probRunOut);
      expect(byId[id]!.after.medianCashAtHorizon).toBeGreaterThan(
        byId[id]!.before.medianCashAtHorizon,
      );
    }
  });

  it('landing a client first and going hybrid both reduce the risk of running out', () => {
    expect(byId.land_first_client!.after.probRunOut).toBeLessThan(
      byId.land_first_client!.before.probRunOut,
    );
    expect(byId.go_hybrid!.after.probRunOut).toBeLessThan(byId.go_hybrid!.before.probRunOut);
  });

  it('is sorted by risk reduction', () => {
    const reduction = (r: (typeof results)[number]) => r.before.probRunOut - r.after.probRunOut;
    for (let i = 1; i < results.length; i++) {
      expect(reduction(results[i - 1]!)).toBeGreaterThanOrEqual(reduction(results[i]!));
    }
  });
});

describe('analyze', () => {
  it('returns the simulation plus per-path analysis', () => {
    const full = analyze(SARA_MODEL, { seed: SEED, runs: 300, analysisRuns: 150 });
    expect(full.result.paths).toHaveLength(3);
    expect(Object.keys(full.byPath).sort()).toEqual(['freelance', 'hybrid', 'stay']);
    expect(full.byPath.freelance!.sensitivity.length).toBeGreaterThan(3);
  });
});
