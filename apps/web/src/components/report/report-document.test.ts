import { cloneElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { analyze } from '@futuria/engine';
import {
  type PathNarrative,
  SARA_MODEL,
  type SimulationDto,
  decisionModelSchema,
  milestoneMonths,
} from '@futuria/shared';
import { ReportDocument } from './report-document';

/*
 * Renders a long report for real. Guards the react-pdf bug described above the stylesheet in
 * report-document.tsx: a lineHeight compounds on every page relayout, so the fixed footer drifted
 * off the page and long reports failed with "unsupported number".
 */

const A4_HEIGHT = 841.89;
const sentence = (n: number) =>
  `This is a deliberately long line of story text number ${n}, so the report runs over many pages.`;

/** A full story for every path: milestones with every list filled, and a long action plan. */
function longNarrative(horizon: number): PathNarrative {
  const milestones = milestoneMonths(horizon).map((month) => ({
    month,
    headline: sentence(month),
    events: [sentence(1), sentence(2), sentence(3)],
    opportunities: [sentence(4)],
    challenges: [sentence(5), sentence(6)],
    risks: [sentence(7), sentence(8)],
  }));
  return {
    scenarios: { optimistic: milestones, realistic: milestones, pessimistic: milestones },
    actionPlan: Array.from({ length: 4 }, (_, i) => ({
      interventionId: null,
      title: `Action ${i + 1}`,
      why: sentence(10 + i),
      steps: [sentence(20), sentence(21), sentence(22), sentence(23)],
    })),
  };
}

function longSimulation(): SimulationDto {
  const model = decisionModelSchema.parse(SARA_MODEL);
  const analysis = analyze(model, { seed: 7, runs: 200, analysisRuns: 50 });
  const now = new Date('2026-11-20T00:00:00Z').toISOString();
  return {
    id: '507f1f77bcf86cd799439011',
    title: 'Freelance or stay?',
    decisionText: 'Should I quit my job to freelance?',
    status: 'ready',
    intake: null,
    model,
    seed: 7,
    analysis,
    narrative: Object.fromEntries(
      model.paths.map((p) => [p.id, longNarrative(model.horizonMonths)]),
    ),
    engineVersion: null,
    promptVersion: null,
    error: null,
    share: { slug: null, isPublic: false, showNumbers: false },
    createdAt: now,
    updatedAt: now,
    lastRunAt: now,
  };
}

interface LayoutNode {
  box?: { top: number; height: number };
  children?: LayoutNode[];
}

describe('ReportDocument', () => {
  it('renders a long report with the footer on every page', async () => {
    let layout: LayoutNode | undefined;
    const doc = cloneElement(
      ReportDocument({ simulation: longSimulation(), generatedAt: new Date() }),
      {
        // react-pdf hands the computed layout to onRender (an internal but stable field).
        onRender: (info: { _INTERNAL__LAYOUT__DATA_?: LayoutNode }) => {
          layout = info._INTERNAL__LAYOUT__DATA_;
        },
      } as object,
    );

    const pdf = await renderToBuffer(doc);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const pages = layout?.children ?? [];
    // Long enough to have crashed before the fix (it failed from about 11 pages).
    expect(pages.length).toBeGreaterThanOrEqual(12);
    for (const page of pages) {
      const footer = page.children?.at(-1)?.box;
      expect(footer).toBeDefined();
      expect(footer!.top).toBeGreaterThan(A4_HEIGHT / 2);
      expect(footer!.top + footer!.height).toBeLessThanOrEqual(A4_HEIGHT);
    }
  }, 30_000);
});
