import type { HybridPath } from '@futuria/shared';
import { wholeMonths } from '../distributions';
import { FreelanceBusiness, sampleFreelance } from './freelance';
import type { PathFactory } from './types';

/**
 * Keep (part of) the job while freelancing on the side, then go full-time freelance.
 * The client base built during the transition carries over, which is exactly why this path
 * tends to be safer than quitting outright.
 */
export const createHybridRun: PathFactory<HybridPath> = (path, baseline, s) => {
  const transition = wholeMonths(s.dist('transitionMonths', path.transitionMonths));
  const sideHours = s.dist('sideHoursPerWeek', path.sideHoursPerWeek);
  const x = sampleFreelance(path.freelance, s, 'freelance.');
  const business = new FreelanceBusiness(path.freelance, x);
  const transitionSalary = baseline.currentMonthlyNetSalary * path.transitionSalaryFraction;

  return {
    step(month, d, events) {
      const inTransition = month <= transition;
      if (transition > 0 && month === transition + 1) {
        events?.push({ month, type: 'switched_full_time' });
      }
      const target = inTransition ? sideHours : x.billableHoursPerWeek;
      const freelanceIncome = business.step(month, d, target, events);
      return (inTransition ? transitionSalary : 0) + freelanceIncome;
    },
  };
};
