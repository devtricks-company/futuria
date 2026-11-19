import { describe, expect, it } from 'vitest';
import { PLANS } from '@futuria/shared';
import { ApiError } from './api';
import {
  horizonUpgrade,
  isSignupRequired,
  parseUpgradeParams,
  pathsUpgrade,
  planHighlights,
  priceLabel,
  quotaLeft,
  quotaUpgrade,
  storyUpgrade,
  upgradeFromError,
  upgradeHref,
  yearlySavings,
} from './plan-gates';

const apiError = (status: number, code: string, requiredPlan?: string) =>
  new ApiError(status, {
    statusCode: status,
    error: 'x',
    message: 'm',
    code,
    requiredPlan: requiredPlan as never,
  });

describe('plan gates', () => {
  it('turns API plan errors into an upgrade offer', () => {
    expect(upgradeFromError(apiError(403, 'quota_exceeded', 'pro'))).toEqual({
      reason: 'quota',
      plan: 'pro',
    });
    expect(upgradeFromError(apiError(403, 'plan_feature', 'pro'))?.reason).toBe('story');
    expect(upgradeFromError(apiError(403, 'plan_limit', 'premium'))).toEqual({
      reason: 'limits',
      plan: 'premium',
    });
    // Nothing to buy (Business isn't sold yet), or not a plan error at all.
    expect(upgradeFromError(apiError(403, 'quota_exceeded', 'business'))).toBeNull();
    expect(upgradeFromError(apiError(403, 'quota_exceeded'))).toBeNull();
    expect(upgradeFromError(apiError(409, 'run_in_progress', 'pro'))).toBeNull();
    expect(upgradeFromError(new Error('boom'))).toBeNull();
  });

  it('recognizes the signup gate', () => {
    expect(isSignupRequired(apiError(401, 'signup_required'))).toBe(true);
    expect(isSignupRequired(apiError(401, 'unauthorized'))).toBe(false);
  });

  it('counts the runs left', () => {
    expect(quotaLeft({ limits: PLANS.free, usage: { simulationsUsed: 1 } } as never)).toBe(2);
    expect(quotaLeft({ limits: PLANS.free, usage: { simulationsUsed: 5 } } as never)).toBe(0);
  });

  it('suggests the cheapest plan that unlocks each limit', () => {
    expect(horizonUpgrade(12, 'free')).toBeNull();
    expect(horizonUpgrade(24, 'free')).toBe('pro');
    expect(horizonUpgrade(60, 'free')).toBe('premium');
    expect(horizonUpgrade(60, 'pro')).toBe('premium');
    expect(pathsUpgrade('free')).toBe('pro');
    expect(pathsUpgrade('premium')).toBeNull(); // only Business compares more, and isn't sold
    expect(storyUpgrade('free')).toBe('pro');
    expect(storyUpgrade('pro')).toBeNull();
    expect(quotaUpgrade('free')).toBe('pro');
    expect(quotaUpgrade('pro')).toBe('premium');
    expect(quotaUpgrade('premium')).toBeNull();
  });

  it('describes plans and prices', () => {
    expect(planHighlights(PLANS.free)[0]).toBe('3 simulations to start');
    expect(planHighlights(PLANS.pro)).toContain('Update the story after tweaks');
    expect(priceLabel('pro', 'month')).toEqual({ amount: '$19', per: 'a month' });
    expect(priceLabel('premium', 'year')).toEqual({ amount: '$490', per: 'a year' });
    expect(yearlySavings('pro')).toBe(38);
  });

  it('round-trips upgrade links', () => {
    const href = upgradeHref('premium', 'year');
    expect(href).toBe('/settings/billing?upgrade=premium&interval=year');
    expect(parseUpgradeParams(new URL(href, 'http://x').searchParams)).toEqual({
      plan: 'premium',
      interval: 'year',
    });
    expect(parseUpgradeParams(new URLSearchParams('upgrade=pro'))).toEqual({
      plan: 'pro',
      interval: 'month',
    });
    expect(parseUpgradeParams(new URLSearchParams('upgrade=business'))).toBeNull();
  });
});
