import { describe, expect, it } from 'vitest';
import type { SharedPathDto } from '@futuria/shared';
import {
  helpfulLevers,
  meaningfulDrivers,
  riskiestPath,
  shareDescription,
  sharePath,
} from './share-view';

type Lever = SharedPathDto['levers'][number];

const lever = (
  label: string,
  before: number,
  after: number,
  be: [number | null, number | null] = [9, 9],
): Lever => ({
  label,
  probRunOutBefore: before,
  probRunOutAfter: after,
  breakEvenMonthBefore: be[0],
  breakEvenMonthAfter: be[1],
});

const path = (overrides: Partial<SharedPathDto>): SharedPathDto => ({
  pathId: 'freelance',
  name: 'Quit & freelance',
  type: 'freelance',
  index: 1,
  probRunOut: 0.19,
  medianRunOutMonth: 7,
  probBreakEven: 0.72,
  medianBreakEvenMonth: 9,
  topDrivers: [],
  levers: [],
  ...overrides,
});

const stay = path({
  pathId: 'stay',
  name: 'Stay employed',
  type: 'stay',
  index: 0,
  probRunOut: 0,
  medianBreakEvenMonth: 1,
});

describe('share view helpers', () => {
  it('links to the public page', () => {
    expect(sharePath('Ab3_x-9QzLmN')).toBe('/share/Ab3_x-9QzLmN');
  });

  it('keeps drivers that move at least 5% of the outcome', () => {
    const drivers = meaningfulDrivers(
      path({
        topDrivers: [
          { label: 'Billable hours', share: 0.27 },
          { label: 'Yearly raise', share: 0.01 },
        ],
      }),
    );
    expect(drivers.map((d) => d.label)).toEqual(['Billable hours']);
  });

  it('ranks levers by how much safer they make the path, then by earlier break-even', () => {
    const levers = helpfulLevers(
      path({
        levers: [
          lever('Raise your rate', 0.19, 0.12),
          lever('Land a client first', 0.19, 0.01),
          lever('No effect', 0.19, 0.19),
          lever('Cut expenses', 0.19, 0.19, [9, 7]),
          lever('Save first', 0.19, 0.05),
        ],
      }),
    );
    expect(levers.map((l) => l.label)).toEqual([
      'Land a client first',
      'Save first',
      'Raise your rate',
    ]);
    expect(
      helpfulLevers(path({ levers: [lever('Cut expenses', 0.19, 0.19, [9, 7])] })),
    ).toHaveLength(1);
  });

  it('gives advice on the riskiest path that is not staying put', () => {
    const hybrid = path({ pathId: 'hybrid', name: 'Hybrid', type: 'hybrid', probRunOut: 0.02 });
    expect(riskiestPath([stay, path({}), hybrid])?.pathId).toBe('freelance');
    expect(riskiestPath([stay])?.pathId).toBe('stay');
  });

  it('describes a share with chances and months, never amounts', () => {
    const text = shareDescription({ paths: [stay, path({})], horizonMonths: 12 });
    expect(text).toBe(
      'Stay employed: 0% chance of running out. Quit & freelance: 19% chance of running out, covers its costs from month 9. 12 months, simulated with FUTURIA.',
    );
    expect(text).not.toMatch(/\$/);
  });

  it('keeps long descriptions short enough for link previews', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      path({ pathId: `p${i}`, name: `A long path name ${i}` }),
    );
    expect(shareDescription({ paths: many, horizonMonths: 60 }).length).toBeLessThanOrEqual(300);
  });
});
