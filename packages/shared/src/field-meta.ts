/*
 * Units and plausible bounds for model fields, keyed by the last segment of the field path
 * (like FIELD_LABELS). One source for the API's sanity clamps on Claude's numbers and for the
 * web app's inputs and sliders.
 *
 * Money is in the model's currency. Fractions are stored as 0.25 = 25% and shown as percentages.
 */

export type FieldUnit =
  /** A one-off or total amount (savings, setup cost). */
  | 'money'
  | 'moneyPerMonth'
  | 'moneyPerHour'
  /** A duration in months. */
  | 'months'
  /** A calendar month index (1 = next month). */
  | 'month'
  | 'hoursPerWeek'
  /** A plain fraction shown as a percentage. */
  | 'fraction'
  | 'fractionPerYear'
  | 'fractionPerMonth';

export interface FieldMeta {
  unit: FieldUnit;
  min: number;
  max: number;
}

export const FIELD_META: Record<string, FieldMeta> = {
  // baseline
  startingCash: { unit: 'money', min: -10_000_000, max: 100_000_000 },
  monthlyExpenses: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  annualExpenseGrowth: { unit: 'fractionPerYear', min: -0.5, max: 1 },
  currentMonthlyNetSalary: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  otherMonthlyIncome: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  emergencyFloor: { unit: 'money', min: -10_000_000, max: 10_000_000 },
  // stay / newJob
  annualRaisePct: { unit: 'fractionPerYear', min: -0.1, max: 0.3 },
  annualLayoffProb: { unit: 'fractionPerYear', min: 0, max: 0.5 },
  monthsToReemploy: { unit: 'months', min: 0, max: 24 },
  monthsToFindJob: { unit: 'months', min: 0, max: 24 },
  newMonthlyNetSalary: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  signOnBonus: { unit: 'money', min: -1_000_000, max: 1_000_000 }, // negative: a one-off cost
  // freelance (also hybrid.freelance)
  monthsToFirstClient: { unit: 'months', min: 0, max: 24 },
  hourlyRate: { unit: 'moneyPerHour', min: 5, max: 500 },
  billableHoursPerWeek: { unit: 'hoursPerWeek', min: 0, max: 60 },
  rampMonths: { unit: 'months', min: 0, max: 24 },
  initialBookedHoursPerWeek: { unit: 'hoursPerWeek', min: 0, max: 60 },
  monthlyClientLossProb: { unit: 'fractionPerMonth', min: 0, max: 0.5 },
  businessCostsMonthly: { unit: 'moneyPerMonth', min: 0, max: 100_000 },
  taxRate: { unit: 'fraction', min: 0, max: 0.6 },
  setupCost: { unit: 'money', min: 0, max: 1_000_000 },
  revenueVolatility: { unit: 'fraction', min: 0, max: 1 },
  // startup
  monthsToFirstRevenue: { unit: 'months', min: 0, max: 36 },
  startingMrr: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  monthlyGrowthRate: { unit: 'fractionPerMonth', min: -0.3, max: 0.5 },
  monthlyFailureProb: { unit: 'fractionPerMonth', min: 0, max: 0.3 },
  monthlyBurn: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  fallbackMonthlySalary: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  probability: { unit: 'fraction', min: 0, max: 1 },
  month: { unit: 'month', min: 1, max: 120 },
  founderMonthlySalary: { unit: 'moneyPerMonth', min: 0, max: 1_000_000 },
  // hybrid
  transitionMonths: { unit: 'months', min: 0, max: 24 },
  transitionSalaryFraction: { unit: 'fraction', min: 0, max: 1 },
  sideHoursPerWeek: { unit: 'hoursPerWeek', min: 0, max: 40 },
};

/** Field metadata by full path ("freelance.hourlyRate", "baseline.startingCash"), if known. */
export function metaForField(fieldPath: string): FieldMeta | undefined {
  const last = fieldPath.split('.').pop() ?? fieldPath;
  return FIELD_META[last];
}

export function isFractionUnit(unit: FieldUnit): boolean {
  return unit === 'fraction' || unit === 'fractionPerYear' || unit === 'fractionPerMonth';
}

export function isMoneyUnit(unit: FieldUnit): boolean {
  return unit === 'money' || unit === 'moneyPerMonth' || unit === 'moneyPerHour';
}
