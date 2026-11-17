import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { type DecisionModelInput, PERCENTILES, SARA_MODEL, fixed, range } from '@futuria/shared';
import { parseModel, runOnce, simulate } from '../src/simulate';

const SEED = 12345;

function baseModel(overrides: Partial<DecisionModelInput> = {}): DecisionModelInput {
  return {
    horizonMonths: 12,
    baseline: {
      startingCash: 10000,
      monthlyExpenses: fixed(2000),
      currentMonthlyNetSalary: 4000,
    },
    paths: [{ id: 'stay', name: 'Stay', type: 'stay', annualLayoffProb: 0 }],
    ...overrides,
  };
}

describe('simulate: determinism and shape', () => {
  it('produces identical results for the same seed', () => {
    const a = simulate(SARA_MODEL, { seed: SEED, runs: 300 });
    const b = simulate(SARA_MODEL, { seed: SEED, runs: 300 });
    expect(b).toEqual(a);
  });

  it('produces different results for a different seed', () => {
    const a = simulate(SARA_MODEL, { seed: 1, runs: 300 });
    const b = simulate(SARA_MODEL, { seed: 2, runs: 300 });
    expect(b.paths[1]!.cash.p50).not.toEqual(a.paths[1]!.cash.p50);
  });

  it('returns series of length horizon + 1 starting at the current savings', () => {
    const result = simulate(SARA_MODEL, { seed: SEED, runs: 200 });
    expect(result.paths).toHaveLength(3);
    for (const path of result.paths) {
      for (const k of PERCENTILES) {
        expect(path.cash[k]).toHaveLength(13);
        expect(path.cash[k][0]).toBe(18000);
        expect(path.income[k]).toHaveLength(13);
      }
      for (const scenario of Object.values(path.scenarios)) {
        expect(scenario.cash).toHaveLength(13);
        expect(scenario.cash[0]).toBe(18000);
      }
    }
  });

  it('can simulate a subset of paths', () => {
    const result = simulate(SARA_MODEL, { seed: SEED, runs: 100, pathIds: ['hybrid'] });
    expect(result.paths.map((p) => p.pathId)).toEqual(['hybrid']);
  });

  it('rejects invalid models', () => {
    const model = baseModel({
      paths: [
        { id: 'a', name: 'A', type: 'stay' },
        { id: 'a', name: 'B', type: 'stay' },
      ],
    });
    expect(() => simulate(model, { seed: SEED })).toThrow(/Duplicate path id/);
  });
});

describe('simulate: percentile ordering (property)', () => {
  const rangeArb = (min: number, max: number) =>
    fc
      .tuple(
        fc.double({ min, max, noNaN: true }),
        fc.double({ min, max, noNaN: true }),
        fc.double({ min, max, noNaN: true }),
      )
      .map(([a, b, c]) => {
        const [low, likely, high] = [a, b, c].sort((x, y) => x - y) as [number, number, number];
        return range(low, likely, high);
      });

  it('keeps P10 <= P25 <= P50 <= P75 <= P90 every month', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.double({ min: 0, max: 50000, noNaN: true }),
        rangeArb(500, 6000),
        rangeArb(10, 150),
        rangeArb(0, 40),
        rangeArb(0, 6),
        (seed, startingCash, expenses, rate, hours, firstClient) => {
          const model: DecisionModelInput = {
            horizonMonths: 12,
            baseline: { startingCash, monthlyExpenses: expenses, currentMonthlyNetSalary: 4000 },
            paths: [
              {
                id: 'fl',
                name: 'Freelance',
                type: 'freelance',
                monthsToFirstClient: firstClient,
                hourlyRate: rate,
                billableHoursPerWeek: hours,
                taxRate: fixed(0.25),
              },
              { id: 'stay', name: 'Stay', type: 'stay' },
            ],
          };
          const result = simulate(model, { seed, runs: 60 });
          for (const path of result.paths) {
            for (const series of [path.cash, path.income]) {
              for (let m = 0; m <= 12; m++) {
                for (let k = 1; k < PERCENTILES.length; k++) {
                  expect(series[PERCENTILES[k]!][m]!).toBeGreaterThanOrEqual(
                    series[PERCENTILES[k - 1]!][m]!,
                  );
                }
              }
            }
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe('simulate: closed-form checks', () => {
  it('with zero income, cash falls by exactly the expenses each month', () => {
    const model = baseModel({
      baseline: { startingCash: 5000, monthlyExpenses: fixed(1000), currentMonthlyNetSalary: 4000 },
      paths: [
        {
          id: 'search',
          name: 'Quit and search',
          type: 'newJob',
          quitBeforeSearching: true,
          monthsToFindJob: fixed(99),
          newMonthlyNetSalary: fixed(5000),
        },
      ],
    });
    const path = simulate(model, { seed: SEED, runs: 50 }).paths[0]!;
    for (const k of PERCENTILES) {
      expect(path.cash[k]).toEqual(Array.from({ length: 13 }, (_, m) => 5000 - 1000 * m));
    }
    // Cash is 0 at month 5 (not below the floor) and -1000 at month 6.
    expect(path.metrics.probRunOut).toBe(1);
    expect(path.metrics.medianRunOutMonth).toBe(6);
    expect(path.metrics.probBreakEven).toBe(0);
    expect(path.metrics.medianBreakEvenMonth).toBeNull();
    expect(path.scenarios.realistic.events).toContainEqual({ month: 6, type: 'ran_out' });
  });

  it('stay path with fixed inputs matches the closed form (raise after 12 months)', () => {
    const model = baseModel({
      horizonMonths: 24,
      baseline: { startingCash: 1000, monthlyExpenses: fixed(2500), currentMonthlyNetSalary: 4000 },
      paths: [
        {
          id: 'stay',
          name: 'Stay',
          type: 'stay',
          annualRaisePct: fixed(0.03),
          annualLayoffProb: 0,
        },
      ],
    });
    const path = simulate(model, { seed: SEED, runs: 20 }).paths[0]!;
    const expected = 1000 + 12 * (4000 - 2500) + 12 * (4120 - 2500);
    expect(path.cash.p10[24]).toBe(expected);
    expect(path.cash.p90[24]).toBe(expected);
    expect(path.metrics.probRunOut).toBe(0);
    expect(path.metrics.medianBreakEvenMonth).toBe(1);
  });

  it('grows expenses by the yearly rate', () => {
    const model = parseModel(
      baseModel({
        horizonMonths: 13,
        baseline: {
          startingCash: 0,
          monthlyExpenses: fixed(1000),
          annualExpenseGrowth: 0.12,
          currentMonthlyNetSalary: 4000,
        },
      }),
    );
    const run = runOnce(model, model.paths[0]!, SEED, 0);
    expect(run.expenses[1]).toBeCloseTo(1000, 6);
    expect(run.expenses[13]).toBeCloseTo(1120, 6);
  });

  it('startup failure leads to a job search and then the fallback salary', () => {
    const model = parseModel(
      baseModel({
        paths: [
          {
            id: 'startup',
            name: 'Startup',
            type: 'startup',
            monthsToFirstRevenue: fixed(3),
            startingMrr: fixed(1000),
            monthlyGrowthRate: fixed(0.1),
            monthlyFailureProb: 1,
            monthlyBurn: fixed(500),
            fallbackMonthlySalary: fixed(3500),
            monthsToReemploy: fixed(2),
          },
        ],
      }),
    );
    const run = runOnce(model, model.paths[0]!, SEED, 0, true);
    expect(Array.from(run.income.slice(1, 5))).toEqual([0, 0, 3500, 3500]);
    expect(run.events).toContainEqual({ month: 1, type: 'startup_failed' });
    expect(run.events).toContainEqual({ month: 3, type: 'reemployed' });
  });

  it('freelance has no revenue before the first client, then a first_client event', () => {
    const model = parseModel(
      baseModel({
        paths: [
          {
            id: 'fl',
            name: 'Freelance',
            type: 'freelance',
            monthsToFirstClient: fixed(2),
            hourlyRate: fixed(50),
            billableHoursPerWeek: fixed(20),
            businessCostsMonthly: fixed(100),
            setupCost: 400,
            monthlyClientLossProb: 0,
            taxRate: fixed(0.2),
          },
        ],
      }),
    );
    const run = runOnce(model, model.paths[0]!, SEED, 0, true);
    expect(run.income[1]).toBe(-500);
    expect(run.income[2]).toBe(-100);
    expect(run.income[3]!).toBeGreaterThan(0);
    expect(run.events!.filter((e) => e.type === 'first_client')).toEqual([
      { month: 3, type: 'first_client' },
    ]);
  });

  it('hybrid keeps the salary during the transition', () => {
    const model = parseModel(
      baseModel({
        paths: [
          {
            id: 'hy',
            name: 'Hybrid',
            type: 'hybrid',
            transitionMonths: fixed(99),
            sideHoursPerWeek: fixed(0),
            freelance: {
              monthsToFirstClient: fixed(0),
              hourlyRate: fixed(50),
              billableHoursPerWeek: fixed(20),
              taxRate: fixed(0.2),
            },
          },
        ],
      }),
    );
    const run = runOnce(model, model.paths[0]!, SEED, 0, true);
    expect(Array.from(run.income.slice(1))).toEqual(Array.from({ length: 12 }, () => 4000));
    expect(run.events!.some((e) => e.type === 'switched_full_time')).toBe(false);
  });

  it('shares baseline draws across paths (same expenses for the same run)', () => {
    const model = parseModel(SARA_MODEL);
    const a = runOnce(model, model.paths[0]!, SEED, 7);
    const b = runOnce(model, model.paths[1]!, SEED, 7);
    expect(Array.from(b.expenses)).toEqual(Array.from(a.expenses));
  });
});

describe('simulate: Sara sanity', () => {
  const result = simulate(SARA_MODEL, { seed: SEED, runs: 1000 });
  const byId = Object.fromEntries(result.paths.map((p) => [p.pathId, p]));

  it('orders scenarios optimistic >= realistic >= pessimistic', () => {
    for (const path of result.paths) {
      const final = (k: 'optimistic' | 'realistic' | 'pessimistic') =>
        path.scenarios[k].cash[result.horizonMonths]!;
      expect(final('optimistic')).toBeGreaterThanOrEqual(final('realistic'));
      expect(final('realistic')).toBeGreaterThanOrEqual(final('pessimistic'));
    }
  });

  it('ranks risk: quitting outright is riskiest, staying is near zero', () => {
    const { stay, hybrid, freelance } = byId as Record<string, (typeof result.paths)[number]>;
    expect(stay!.metrics.probRunOut).toBeLessThan(0.01);
    expect(hybrid!.metrics.probRunOut).toBeLessThan(freelance!.metrics.probRunOut);
    expect(stay!.metrics.probRunOut).toBeLessThan(freelance!.metrics.probRunOut);
    expect(stay!.metrics.cashAtHorizon.p50).toBeGreaterThan(freelance!.metrics.cashAtHorizon.p50);
  });

  it('does not count salary during a hybrid transition as breaking even', () => {
    const hybrid = byId.hybrid!;
    // The salary stops after month 6, so a sustained break-even must come later (or never).
    expect(
      hybrid.metrics.medianBreakEvenMonth === null || hybrid.metrics.medianBreakEvenMonth > 6,
    ).toBe(true);
  });

  it('simulates 3 paths x 1,000 runs x 24 months quickly', () => {
    const model = parseModel({ ...SARA_MODEL, horizonMonths: 24 });
    simulate(model, { seed: SEED, runs: 200 }); // warm-up
    const t0 = performance.now();
    simulate(model, { seed: SEED, runs: 1000 });
    // Budget is 50 ms in the browser; keep CI lenient.
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
