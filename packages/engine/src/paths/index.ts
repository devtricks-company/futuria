import type { Baseline, PathConfig } from '@futuria/shared';
import type { Sampler } from '../distributions';
import { createFreelanceRun } from './freelance';
import { createHybridRun } from './hybrid';
import { createNewJobRun } from './new-job';
import { createStartupRun } from './startup';
import { createStayRun } from './stay';
import type { PathRun } from './types';

export function createPathRun(path: PathConfig, baseline: Baseline, sampler: Sampler): PathRun {
  switch (path.type) {
    case 'stay':
      return createStayRun(path, baseline, sampler);
    case 'freelance':
      return createFreelanceRun(path, baseline, sampler);
    case 'startup':
      return createStartupRun(path, baseline, sampler);
    case 'newJob':
      return createNewJobRun(path, baseline, sampler);
    case 'hybrid':
      return createHybridRun(path, baseline, sampler);
    default: {
      const unreachable: never = path;
      throw new Error(`Unknown path type: ${JSON.stringify(unreachable)}`);
    }
  }
}

export type { MonthlyDraws, PathRun } from './types';
export { WEEKS_PER_MONTH } from './types';
