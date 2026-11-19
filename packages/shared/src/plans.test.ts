import { describe, expect, it } from 'vitest';
import {
  BILLABLE_PLANS,
  BILLING_INTERVALS,
  PLANS,
  PLAN_IDS,
  cheapestPlanWhere,
  parsePriceLookupKey,
  planPrice,
  priceLookupKey,
} from './plans';
import { addMonthsUtc, currentUsagePeriod } from './usage';

describe('plan prices', () => {
  it('prices yearly plans at 10x monthly', () => {
    for (const id of PLAN_IDS) {
      expect(PLANS[id].priceUsdYearly).toBe(PLANS[id].priceUsdMonthly * 10);
    }
    expect(planPrice('pro', 'month')).toBe(19);
    expect(planPrice('premium', 'year')).toBe(490);
  });

  it('keeps AI cost under half of revenue at full use ($0.367 per simulation)', () => {
    for (const id of BILLABLE_PLANS) {
      const cost = PLANS[id].simulations * 0.367;
      expect(cost / PLANS[id].priceUsdMonthly).toBeLessThan(0.5);
    }
  });

  it('round-trips unique Stripe lookup keys', () => {
    const keys = BILLABLE_PLANS.flatMap((plan) =>
      BILLING_INTERVALS.map((interval) => priceLookupKey(plan, interval)),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(priceLookupKey('pro', 'year')).toBe('futuria_pro_year');
    expect(parsePriceLookupKey('futuria_premium_month')).toEqual({
      plan: 'premium',
      interval: 'month',
    });
    expect(parsePriceLookupKey('futuria_business_month')).toBeNull();
    expect(parsePriceLookupKey('futuria_pro_week')).toBeNull();
    expect(parsePriceLookupKey(null)).toBeNull();
  });

  it('finds the cheapest plan that allows something', () => {
    expect(cheapestPlanWhere((p) => p.maxHorizonMonths >= 24)).toBe('pro');
    expect(cheapestPlanWhere((p) => p.maxHorizonMonths >= 36)).toBe('premium');
    expect(cheapestPlanWhere((p) => p.features.storyRefresh)).toBe('pro');
    expect(cheapestPlanWhere((p) => p.features.storyRefresh, 'pro')).toBe('premium');
    expect(cheapestPlanWhere((p) => p.maxPaths > 8)).toBeNull();
  });
});

describe('usage periods', () => {
  const at = (iso: string) => new Date(iso);

  it('adds months with end-of-month clamping', () => {
    expect(addMonthsUtc(at('2026-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(addMonthsUtc(at('2026-11-18T00:00:00Z'), 2).toISOString()).toBe(
      '2027-01-18T00:00:00.000Z',
    );
  });

  it('never rolls a lifetime quota', () => {
    const anchor = at('2025-01-01T00:00:00Z');
    expect(currentUsagePeriod(anchor, at('2026-11-18T00:00:00Z'), 'lifetime')).toEqual({
      start: anchor,
      end: null,
    });
  });

  it('rolls monthly quotas from the anchor without drifting', () => {
    const anchor = at('2026-01-31T12:00:00Z');
    const inMarch = currentUsagePeriod(anchor, at('2026-04-02T00:00:00Z'), 'month');
    expect(inMarch.start.toISOString()).toBe('2026-03-31T12:00:00.000Z');
    expect(inMarch.end?.toISOString()).toBe('2026-04-30T12:00:00.000Z');

    const sameWindow = currentUsagePeriod(anchor, at('2026-02-15T00:00:00Z'), 'month');
    expect(sameWindow.start).toEqual(anchor);

    const boundary = currentUsagePeriod(anchor, at('2026-02-28T12:00:00Z'), 'month');
    expect(boundary.start.toISOString()).toBe('2026-02-28T12:00:00.000Z');
  });
});
