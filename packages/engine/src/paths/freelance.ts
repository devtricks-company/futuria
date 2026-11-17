import type { EngineEvent, FreelanceParams, FreelancePath } from '@futuria/shared';
import { type Sampler, wholeMonths } from '../distributions';
import { standardNormal } from '../rng';
import { type MonthlyDraws, type PathFactory, WEEKS_PER_MONTH } from './types';

export interface FreelanceSample {
  monthsToFirstClient: number;
  hourlyRate: number;
  billableHoursPerWeek: number;
  rampMonths: number;
  businessCostsMonthly: number;
  taxRate: number;
}

export function sampleFreelance(p: FreelanceParams, s: Sampler, prefix = ''): FreelanceSample {
  return {
    monthsToFirstClient: s.dist(`${prefix}monthsToFirstClient`, p.monthsToFirstClient),
    hourlyRate: s.dist(`${prefix}hourlyRate`, p.hourlyRate),
    billableHoursPerWeek: s.dist(`${prefix}billableHoursPerWeek`, p.billableHoursPerWeek),
    rampMonths: s.dist(`${prefix}rampMonths`, p.rampMonths),
    businessCostsMonthly: s.dist(`${prefix}businessCostsMonthly`, p.businessCostsMonthly),
    taxRate: s.dist(`${prefix}taxRate`, p.taxRate),
  };
}

/**
 * A freelance business, modelled as "booked client hours per week":
 * - nothing until the first client arrives,
 * - then bookings grow linearly towards the target over `rampMonths`,
 * - each month there is a chance of losing 25–60% of bookings (a client leaves),
 * - monthly revenue has multiplicative noise.
 * The target can change over time (the hybrid path raises it when going full-time).
 */
export class FreelanceBusiness {
  private booked: number;
  private started: boolean;
  private readonly firstClientMonth: number;

  constructor(
    private readonly p: FreelanceParams,
    private readonly x: FreelanceSample,
    private readonly startMonth = 1,
  ) {
    this.booked = Math.max(0, p.initialBookedHoursPerWeek);
    this.started = this.booked > 0;
    this.firstClientMonth = startMonth + wholeMonths(x.monthsToFirstClient);
  }

  /** Net profit after tax for the month (negative when costs exceed revenue). */
  step(month: number, d: MonthlyDraws, targetHours: number, events: EngineEvent[] | null): number {
    const target = Math.max(0, targetHours);
    const growth = target / Math.max(1, wholeMonths(this.x.rampMonths));

    if (this.started && month > this.firstClientMonth && d.loss < this.p.monthlyClientLossProb) {
      const severity = 0.25 + 0.35 * d.severity;
      this.booked *= 1 - severity;
      events?.push({
        month,
        type: 'client_lost',
        detail: `Lost about ${Math.round(severity * 100)}% of booked work`,
      });
    }

    if (month >= this.firstClientMonth && (this.started || target > 0)) {
      if (!this.started) {
        this.started = true;
        this.booked = Math.min(target, growth);
        events?.push({ month, type: 'first_client' });
      } else {
        this.booked = Math.min(target, this.booked + growth);
      }
    }
    this.booked = Math.min(this.booked, target);

    const noise = Math.max(0, 1 + this.p.revenueVolatility * standardNormal(d.noiseA, d.noiseB));
    const revenue = this.started ? this.booked * WEEKS_PER_MONTH * this.x.hourlyRate * noise : 0;
    const costs = this.x.businessCostsMonthly + (month === this.startMonth ? this.p.setupCost : 0);
    const profit = revenue - costs;
    return profit > 0 ? profit * (1 - this.x.taxRate) : profit;
  }
}

export const createFreelanceRun: PathFactory<FreelancePath> = (path, _baseline, sampler) => {
  const x = sampleFreelance(path, sampler);
  const business = new FreelanceBusiness(path, x);
  return {
    step: (month, d, events) => business.step(month, d, x.billableHoursPerWeek, events),
  };
};
