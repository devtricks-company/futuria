import type { NewJobPath } from '@futuria/shared';
import { wholeMonths } from '../distributions';
import type { PathFactory } from './types';

/** Switch jobs: search (employed or not), then start the new job with yearly raises. */
export const createNewJobRun: PathFactory<NewJobPath> = (path, baseline, s) => {
  const searchMonths = wholeMonths(s.dist('monthsToFindJob', path.monthsToFindJob));
  const newSalary = s.dist('newMonthlyNetSalary', path.newMonthlyNetSalary);
  const raise = s.dist('annualRaisePct', path.annualRaisePct);
  const startMonth = searchMonths + 1;

  return {
    step(month, _d, events) {
      if (month < startMonth) {
        return path.quitBeforeSearching ? 0 : baseline.currentMonthlyNetSalary;
      }
      const yearsIn = Math.floor((month - startMonth) / 12);
      let income = newSalary * Math.pow(1 + raise, yearsIn);
      if (month === startMonth) {
        income += path.signOnBonus;
        events?.push({ month, type: 'job_found' });
      }
      return income;
    },
  };
};
