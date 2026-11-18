import { describe, expect, it } from 'vitest';
import { SARA_MODEL, decisionModelSchema } from '@futuria/shared';
import { simulate } from '@futuria/engine';
import { DEMO_SEED } from './demo';
import { futuresChart, spreadLabels } from './futures';

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
