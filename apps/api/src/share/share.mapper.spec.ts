import { analyze } from '@futuria/engine';
import { type PublicShareDto, SARA_MODEL, decisionModelSchema } from '@futuria/shared';
import { type SharedSimulation, toShareView } from './share.mapper.js';

const model = decisionModelSchema.parse(SARA_MODEL);
const analysis = analyze(model, { seed: 42, runs: 200, analysisRuns: 100 });

const shared = (
  showNumbers: boolean,
  overrides: Partial<SharedSimulation> = {},
): SharedSimulation => ({
  title: 'Quit to freelance?',
  model,
  analysis,
  narrative: null,
  share: { slug: 'Ab3_x-9QzLmN', isPublic: true, showNumbers },
  lastRunAt: new Date('2026-11-19T10:00:00Z'),
  ...overrides,
});

/** Sara's own amounts: none of them may reach a page with hidden numbers. */
const PERSONAL_AMOUNTS = [18000, 5200, 2900, 3100, 3400, 1500];
/** Keys that only ever hold amounts or the person's own inputs. */
const MONEY_KEYS = ['cash', 'income', 'sampled', 'startingCash', 'description', 'baseline'];

describe('toShareView', () => {
  const hidden = toShareView(shared(false), 'free') as PublicShareDto;
  const json = JSON.stringify(hidden);

  it('keeps every amount and personal input out when numbers are hidden', () => {
    expect(hidden.status).toBe('ready');
    expect(hidden.details).toBeNull();
    expect(hidden.chart.startCash).toBeNull();
    expect(hidden.chart.bundles.every((b) => b.end === null)).toBe(true);
    for (const amount of PERSONAL_AMOUNTS) {
      expect(json).not.toMatch(new RegExp(`(?<![\\d.])${amount}(?![\\d])`));
    }
    for (const key of MONEY_KEYS) expect(json).not.toContain(`"${key}"`);
  });

  it('shares chances, months and labels for every path, in model order', () => {
    expect(hidden.paths.map((p) => [p.pathId, p.index])).toEqual(
      model.paths.map((p, i) => [p.id, i]),
    );
    const freelance = hidden.paths.find((p) => p.pathId === 'freelance')!;
    const metrics = analysis.result.paths.find((p) => p.pathId === 'freelance')!.metrics;
    expect(freelance.probRunOut).toBe(metrics.probRunOut);
    expect(freelance.medianBreakEvenMonth).toBe(metrics.medianBreakEvenMonth);
    expect(freelance.topDrivers.length).toBeGreaterThan(0);
    expect(freelance.topDrivers.length).toBeLessThanOrEqual(3);
    expect(freelance.levers.length).toBe(analysis.byPath.freelance!.interventions.length);
    expect(hidden.chart.bundles).toHaveLength(model.paths.length);
  });

  it('adds the full results and amounts when the owner opts in', () => {
    const shown = toShareView(shared(true), 'free') as PublicShareDto;
    expect(shown.details?.analysis).toBe(analysis);
    expect(shown.details?.emergencyFloor).toBe(0);
    expect(shown.chart.startCash).toBe(18000);
  });

  it('watermarks only plans with watermarked sharing', () => {
    expect(hidden.watermark).toBe(true);
    expect(toShareView(shared(false), 'pro').watermark).toBe(false);
  });

  it('says "updating" while the results are being recomputed', () => {
    expect(toShareView(shared(false, { analysis: null }), 'pro')).toEqual({
      status: 'updating',
      slug: 'Ab3_x-9QzLmN',
      title: 'Quit to freelance?',
      watermark: false,
    });
  });
});
