import { describe, expect, it } from 'vitest';
import { SARA_MODEL, decisionModelSchema } from '@futuria/shared';
import { chartMonths, futuresChart, spreadLabels } from '../src/futures-chart';
import { simulate } from '../src/simulate';

const DEMO_SEED = 20261116;
const model = decisionModelSchema.parse(SARA_MODEL);
const result = simulate(model, { seed: DEMO_SEED, runs: 200 });
const chart = futuresChart(model, result, { seed: DEMO_SEED, runsPerPath: 12 });

describe('futuresChart', () => {
  it('draws one bundle per path, in model order', () => {
    expect(chart.bundles.map((b) => b.pathId)).toEqual(model.paths.map((p) => p.id));
    expect(chart.bundles.map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it('draws the requested number of futures, each starting from today', () => {
    for (const bundle of chart.bundles) {
      const starts = bundle.runs.match(/M\d+ \d+/g) ?? [];
      expect(starts).toHaveLength(12);
      expect(new Set(starts).size).toBe(1);
      expect(starts[0]).toBe(`M0 ${Math.round(chart.startY * chart.height)}`);
    }
  });

  it("labels each bundle with the simulation's own numbers", () => {
    const freelance = result.paths.find((p) => p.pathId === 'freelance')!;
    const bundle = chart.bundles.find((b) => b.pathId === 'freelance')!;
    expect(bundle.end).toBe(freelance.cash.p50[model.horizonMonths]);
    expect(bundle.probRunOut).toBe(freelance.metrics.probRunOut);
  });

  it('keeps every position inside the chart', () => {
    for (const v of [
      chart.startY,
      chart.floorY,
      ...chart.bundles.flatMap((b) => [b.endY, b.labelY]),
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const ys = chart.bundles.flatMap((b) => b.runs.match(/-?\d+(?=L|M|$)/g) ?? []).map(Number);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(chart.height);
  });

  it('is deterministic for a seed', () => {
    expect(futuresChart(model, result, { seed: DEMO_SEED, runsPerPath: 12 })).toEqual(chart);
  });

  it('leaves out every amount when money is hidden, keeping the same geometry', () => {
    const hidden = futuresChart(model, result, {
      seed: DEMO_SEED,
      runsPerPath: 12,
      hideMoney: true,
    });
    expect(hidden.startCash).toBeNull();
    expect(hidden.bundles.every((b) => b.end === null)).toBe(true);
    expect(hidden.bundles.map((b) => b.runs)).toEqual(chart.bundles.map((b) => b.runs));
    expect(hidden.startY).toBe(chart.startY);
  });

  it('samples long horizons down to maxPoints per line', () => {
    const long = decisionModelSchema.parse({ ...SARA_MODEL, horizonMonths: 60 });
    const longResult = simulate(long, { seed: DEMO_SEED, runs: 100 });
    const small = futuresChart(long, longResult, {
      seed: DEMO_SEED,
      runsPerPath: 4,
      maxPoints: 25,
    });
    const points = small.bundles[0]!.median.match(/[ML]/g) ?? [];
    expect(points.length).toBeLessThanOrEqual(25);
    expect(
      small.bundles[0]!.median.endsWith(
        `${small.width} ${Math.round(small.bundles[0]!.endY * small.height)}`,
      ),
    ).toBe(true);
  });
});

describe('chartMonths', () => {
  it('keeps every month when there is room', () => {
    expect(chartMonths(12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(chartMonths(12, 25)).toHaveLength(13);
  });

  it('spreads at most max months evenly, always keeping today and the horizon', () => {
    const months = chartMonths(60, 25);
    expect(months.length).toBeLessThanOrEqual(25);
    expect(months[0]).toBe(0);
    expect(months[months.length - 1]).toBe(60);
    expect(new Set(months).size).toBe(months.length);
  });
});

describe('spreadLabels', () => {
  it('leaves labels that are already far apart alone', () => {
    expect(spreadLabels([0.1, 0.5, 0.9], 0.1)).toEqual([0.1, 0.5, 0.9]);
  });

  it('pushes close labels apart, keeping their order', () => {
    const out = spreadLabels([0.5, 0.45, 0.48], 0.1);
    expect(out[1]).toBeCloseTo(0.45);
    expect(out[2]).toBeCloseTo(0.55);
    expect(out[0]).toBeCloseTo(0.65);
  });

  it('shifts the stack up instead of running past the bottom', () => {
    const out = spreadLabels([0.95, 0.97], 0.1);
    expect(out[1]).toBeCloseTo(1);
    expect(out[0]).toBeCloseTo(0.9);
  });
});
