import type { DecisionModelInput } from '../decision-model';
import { fixed, range } from '../distribution';

/**
 * Sara, 29, senior UX designer: $5,200/mo take-home, ~$3,100/mo expenses, $18,000 savings.
 * "What if I quit my job to become a freelance UX designer?"
 * Used by engine tests, the demo script, API e2e tests and UI fixtures.
 */
const saraFreelance = {
  monthsToFirstClient: range(0, 2, 4),
  hourlyRate: range(45, 55, 70),
  billableHoursPerWeek: range(15, 22, 30),
  rampMonths: range(2, 4, 8),
  initialBookedHoursPerWeek: 0,
  monthlyClientLossProb: 0.08,
  businessCostsMonthly: range(150, 250, 400),
  taxRate: range(0.22, 0.27, 0.32),
  setupCost: 1500,
  revenueVolatility: 0.15,
};

export const SARA_MODEL: DecisionModelInput = {
  version: 1,
  horizonMonths: 12,
  baseline: {
    currency: 'USD',
    startingCash: 18000,
    monthlyExpenses: range(2900, 3100, 3400),
    annualExpenseGrowth: 0.03,
    currentMonthlyNetSalary: 5200,
    otherMonthlyIncome: 0,
    emergencyFloor: 0,
  },
  paths: [
    {
      id: 'stay',
      name: 'Stay employed',
      type: 'stay',
      annualRaisePct: range(0.01, 0.03, 0.06),
      annualLayoffProb: 0.06,
      monthsToReemploy: range(1, 3, 6),
    },
    {
      id: 'freelance',
      name: 'Quit & freelance full-time',
      type: 'freelance',
      ...saraFreelance,
    },
    {
      id: 'hybrid',
      name: 'Side-freelance 6 months, then quit',
      type: 'hybrid',
      transitionMonths: fixed(6),
      transitionSalaryFraction: 1,
      sideHoursPerWeek: range(4, 8, 12),
      freelance: saraFreelance,
    },
  ],
  assumptions: [],
};
