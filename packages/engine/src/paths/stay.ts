import type { StayPath } from '@futuria/shared';
import { monthlyHazard, wholeMonths } from '../distributions';
import type { PathFactory } from './types';

/** Keep the current job: yearly raises, with a small risk of layoff and a job search after. */
export const createStayRun: PathFactory<StayPath> = (path, baseline, s) => {
  const raise = s.dist('annualRaisePct', path.annualRaisePct);
  const reemployMonths = Math.max(
    1,
    wholeMonths(s.dist('monthsToReemploy', path.monthsToReemploy)),
  );
  const hazard = monthlyHazard(path.annualLayoffProb);
  const salary = baseline.currentMonthlyNetSalary;

  let employed = true;
  let reemployAt = 0;

  return {
    step(month, d, events) {
      if (!employed) {
        if (month < reemployAt) return 0;
        employed = true;
        events?.push({ month, type: 'reemployed' });
      } else if (d.hazard < hazard) {
        employed = false;
        reemployAt = month + reemployMonths;
        events?.push({
          month,
          type: 'layoff',
          detail: `About ${reemployMonths} months to find a job`,
        });
        return 0;
      }
      return salary * Math.pow(1 + raise, Math.floor((month - 1) / 12));
    },
  };
};
