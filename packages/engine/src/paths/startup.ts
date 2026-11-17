import type { StartupPath } from '@futuria/shared';
import { wholeMonths } from '../distributions';
import { standardNormal } from '../rng';
import type { PathFactory } from './types';

/**
 * Start a company. Bootstrapped: profits (after tax) are the founder's income and losses come
 * out of personal savings. If funded, the founder draws a salary and the company's costs no
 * longer hit personal cash. Each month the startup may shut down, after which the founder
 * looks for a job (if a fallback salary is given).
 */
export const createStartupRun: PathFactory<StartupPath> = (path, _baseline, s) => {
  const firstRevenueMonth =
    1 + wholeMonths(s.dist('monthsToFirstRevenue', path.monthsToFirstRevenue));
  const startingMrr = s.dist('startingMrr', path.startingMrr);
  const growth = s.dist('monthlyGrowthRate', path.monthlyGrowthRate);
  const burn = s.dist('monthlyBurn', path.monthlyBurn);
  const taxRate = s.dist('taxRate', path.taxRate);
  const fallbackSalary = s.optionalDist('fallbackMonthlySalary', path.fallbackMonthlySalary, 0);
  const reemployMonths = Math.max(
    1,
    wholeMonths(s.dist('monthsToReemploy', path.monthsToReemploy)),
  );

  let funded = false;
  let fundingMonth = Number.POSITIVE_INFINITY;
  let founderSalary = 0;
  if (path.funding) {
    const roll = s.uniform();
    fundingMonth = Math.max(1, wholeMonths(s.dist('funding.month', path.funding.month)));
    founderSalary = s.dist('funding.founderMonthlySalary', path.funding.founderMonthlySalary);
    funded = roll < path.funding.probability;
  }

  let mrr = 0;
  let failed = false;
  let reemployAt = 0;
  let reemployed = false;

  return {
    step(month, d, events) {
      if (failed) {
        if (fallbackSalary <= 0 || month < reemployAt) return 0;
        if (!reemployed) {
          reemployed = true;
          events?.push({ month, type: 'reemployed' });
        }
        return fallbackSalary;
      }

      if (d.hazard < path.monthlyFailureProb) {
        failed = true;
        reemployAt = month + reemployMonths;
        events?.push({ month, type: 'startup_failed' });
        return 0;
      }

      if (month === firstRevenueMonth) {
        mrr = startingMrr;
        events?.push({ month, type: 'first_revenue' });
      } else if (month > firstRevenueMonth) {
        const shock = path.revenueVolatility * standardNormal(d.noiseA, d.noiseB);
        mrr *= Math.max(0, 1 + growth + shock);
      }

      if (funded && month >= fundingMonth) {
        if (month === fundingMonth) events?.push({ month, type: 'funded' });
        return founderSalary;
      }

      const profit = mrr - burn - (month === 1 ? path.setupCost : 0);
      return profit > 0 ? profit * (1 - taxRate) : profit;
    },
  };
};
