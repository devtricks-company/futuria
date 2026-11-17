/** Human-readable labels for model fields, keyed by the last segment of the field path. */
export const FIELD_LABELS: Record<string, string> = {
  startingCash: 'Savings today',
  monthlyExpenses: 'Monthly living expenses',
  annualExpenseGrowth: 'Yearly expense growth',
  currentMonthlyNetSalary: 'Current take-home pay',
  otherMonthlyIncome: 'Other monthly income',
  emergencyFloor: 'Emergency floor',
  annualRaisePct: 'Yearly raise',
  annualLayoffProb: 'Yearly layoff risk',
  monthsToReemploy: 'Months to find a job again',
  monthsToFirstClient: 'Months to first client',
  hourlyRate: 'Hourly rate',
  billableHoursPerWeek: 'Billable hours per week',
  rampMonths: 'Months to full workload',
  initialBookedHoursPerWeek: 'Hours already booked',
  monthlyClientLossProb: 'Monthly client-loss risk',
  businessCostsMonthly: 'Business costs per month',
  taxRate: 'Effective tax rate',
  setupCost: 'One-off setup cost',
  revenueVolatility: 'Revenue volatility',
  monthsToFirstRevenue: 'Months to first revenue',
  startingMrr: 'Starting monthly revenue',
  monthlyGrowthRate: 'Monthly revenue growth',
  monthlyFailureProb: 'Monthly shutdown risk',
  monthlyBurn: 'Monthly business costs',
  fallbackMonthlySalary: 'Fallback job pay',
  month: 'Funding month',
  founderMonthlySalary: 'Founder salary after funding',
  monthsToFindJob: 'Months to find the new job',
  newMonthlyNetSalary: 'New take-home pay',
  signOnBonus: 'Sign-on bonus or one-off cost',
  transitionMonths: 'Months combining job and freelancing',
  transitionSalaryFraction: 'Share of salary kept during transition',
  sideHoursPerWeek: 'Side freelance hours per week',
};

export function labelForField(fieldPath: string): string {
  const last = fieldPath.split('.').pop() ?? fieldPath;
  return FIELD_LABELS[last] ?? last;
}
