import { describe, expect, it } from 'vitest';
import { analyze } from '@futuria/engine';
import { SARA_MODEL, decisionModelSchema } from '@futuria/shared';
import { reportFileName, reportSummary, reportUrl } from './report';

describe('report helpers', () => {
  it('names files after the title, ASCII only', () => {
    expect(reportFileName('Freelance or stay?')).toBe('futuria-freelance-or-stay.pdf');
    expect(reportFileName('Café: quitter mon emploi?')).toBe('futuria-cafe-quitter-mon-emploi.pdf');
    expect(reportFileName('???')).toBe('futuria-report.pdf');
    expect(reportFileName('x'.repeat(100))).toBe(`futuria-${'x'.repeat(60)}.pdf`);
  });

  it('points at the report route', () => {
    expect(reportUrl('507f1f77bcf86cd799439011')).toBe('/api/report/507f1f77bcf86cd799439011');
  });

  it("summarizes every path in the model's order with the engine's numbers", () => {
    const model = decisionModelSchema.parse(SARA_MODEL);
    const analysis = analyze(model, { seed: 7, runs: 200, analysisRuns: 50 });
    const rows = reportSummary({ model, analysis });
    expect(rows.map((r) => r.pathId)).toEqual(model.paths.map((p) => p.id));
    const freelance = analysis.result.paths.find((p) => p.pathId === 'freelance')!;
    expect(rows[1]).toMatchObject({
      index: 1,
      probRunOut: freelance.metrics.probRunOut,
      cashP50: freelance.metrics.cashAtHorizon.p50,
    });
    expect(reportSummary({ model: null, analysis: null })).toEqual([]);
  });
});
