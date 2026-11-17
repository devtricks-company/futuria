import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { monthlyHazard, triangularInverse } from '../src/distributions';
import { mulberry32 } from '../src/rng';

describe('rng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
    for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of seqA) expect(v).toBeLessThan(1);
  });
});

describe('triangularInverse', () => {
  it('stays within [low, high] for any input order', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        (u, x, y, z) => {
          const v = triangularInverse(u, x, y, z);
          const lo = Math.min(x, z);
          const hi = Math.max(x, z);
          expect(v).toBeGreaterThanOrEqual(lo - 1e-6);
          expect(v).toBeLessThanOrEqual(hi + 1e-6);
        },
      ),
    );
  });

  it('has the expected mean (low + likely + high) / 3', () => {
    const rng = mulberry32(7);
    const n = 50_000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += triangularInverse(rng(), 10, 20, 60);
    expect(sum / n).toBeCloseTo(30, 0);
  });

  it('returns the value for degenerate ranges', () => {
    expect(triangularInverse(0.3, 5, 5, 5)).toBe(5);
  });
});

describe('monthlyHazard', () => {
  it('compounds back to the annual probability', () => {
    const h = monthlyHazard(0.2);
    expect(1 - Math.pow(1 - h, 12)).toBeCloseTo(0.2, 10);
    expect(monthlyHazard(0)).toBe(0);
    expect(monthlyHazard(1)).toBe(1);
  });
});
