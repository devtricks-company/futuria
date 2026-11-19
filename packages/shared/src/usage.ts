import type { PlanLimits } from './plans';

/**
 * Add calendar months in UTC, clamping to the last day of the target month
 * (Jan 31 + 1 month = Feb 28/29).
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export interface UsagePeriod {
  start: Date;
  /** Exclusive end; null for lifetime quotas. */
  end: Date | null;
}

/**
 * The usage window that contains `now`. Monthly quotas roll in one-month steps from `anchor`
 * (counted from the anchor, so clamping never drifts: Jan 31 → Feb 28 → Mar 31). Stripe
 * renewals re-anchor the window to the billing period. Lifetime quotas never roll.
 */
export function currentUsagePeriod(
  anchor: Date,
  now: Date,
  period: PlanLimits['simulationsPeriod'],
): UsagePeriod {
  if (period === 'lifetime' || now < anchor) {
    return { start: anchor, end: period === 'lifetime' ? null : addMonthsUtc(anchor, 1) };
  }
  // Estimate the step count, then correct for month lengths.
  let k =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  while (k > 0 && addMonthsUtc(anchor, k) > now) k -= 1;
  while (addMonthsUtc(anchor, k + 1) <= now) k += 1;
  return { start: addMonthsUtc(anchor, k), end: addMonthsUtc(anchor, k + 1) };
}
