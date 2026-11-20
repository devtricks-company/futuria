import { z } from 'zod';
import { type PathType, assumptionSchema } from '@futuria/shared';

/*
 * What Claude fills in for buildModel. It mirrors DecisionModel, with three simplifications
 * that keep the structured-output grammar small (the API rejects grammars that are too large):
 *
 * - Every uncertain input is one shape, {low, likely, high}. A known value repeats the same
 *   number three times; the API turns that into a fixed distribution. No fixed|range union.
 * - `paths` is an object keyed by position (path_1, path_2, ...), and the schema is built per
 *   request from the chosen path types, so there is no union over path types either.
 * - No numeric bounds, defaults or refinements: structured outputs can't enforce bounds, and an
 *   out-of-range number should be clamped (clamps.ts), not fail the whole parse.
 *
 * Every field is required (optional ones are nullable), so Claude states each assumption. The API
 * turns the output into a DecisionModel with assembleModel() and validates it with
 * decisionModelSchema before anything is stored or simulated.
 */

const dist = (description: string) =>
  z
    .object({ low: z.number(), likely: z.number(), high: z.number() })
    .describe(`${description}. low <= likely <= high; for a known value repeat the same number`);
export type DistOutput = { low: number; likely: number; high: number };

const freelanceFields = {
  monthsToFirstClient: dist('Months with no client revenue'),
  hourlyRate: dist('Billed hourly rate in the model currency'),
  billableHoursPerWeek: dist('Billable hours per week once ramped up'),
  rampMonths: dist('Months from the first client to a full workload'),
  initialBookedHoursPerWeek: z.number().describe('Hours per week already committed by clients'),
  monthlyClientLossProb: z.number().describe('Chance each month of losing workload (fraction)'),
  businessCostsMonthly: dist('Software, insurance, accounting per month'),
  taxRate: dist('Effective tax rate on profit (fraction)'),
  setupCost: z.number().describe('One-off cost in the first month'),
  revenueVolatility: z.number().describe('Month-to-month revenue noise (fraction, ~0.1-0.3)'),
};

const PATH_OUTPUTS = {
  stay: z.object({
    annualRaisePct: dist('Yearly raise (fraction)'),
    annualLayoffProb: z.number().describe('Chance of a layoff in a given year (fraction)'),
    monthsToReemploy: dist('Months without income after a layoff'),
  }),
  freelance: z.object(freelanceFields),
  startup: z.object({
    monthsToFirstRevenue: dist('Months before the first paying customer'),
    startingMrr: dist('Monthly recurring revenue in the first revenue month'),
    monthlyGrowthRate: dist('Monthly revenue growth (fraction)'),
    monthlyFailureProb: z.number().describe('Chance each month the startup shuts down'),
    monthlyBurn: dist('Business costs per month paid by the founder'),
    taxRate: dist('Effective tax rate on profit (fraction)'),
    setupCost: z.number(),
    revenueVolatility: z.number(),
    fallbackMonthlySalary: dist('Take-home pay of a job taken if the startup fails')
      .nullable()
      .describe('null if the person could not or would not return to a job'),
    monthsToReemploy: dist('Months to find a job after the startup fails'),
    funding: z
      .object({
        probability: z.number().describe('Chance of raising a round within the horizon'),
        month: dist('Month the round closes'),
        founderMonthlySalary: dist('Founder take-home pay after funding'),
      })
      .nullable()
      .describe('Only if the person plans to raise money; otherwise null'),
  }),
  newJob: z.object({
    quitBeforeSearching: z.boolean(),
    monthsToFindJob: dist('Months until the new job starts'),
    newMonthlyNetSalary: dist('Take-home pay in the new job'),
    annualRaisePct: dist('Yearly raise in the new job (fraction)'),
    signOnBonus: z
      .number()
      .describe(
        'One-off net amount when the new job starts: bonus (+) or cost such as relocation (-); 0 if none',
      ),
  }),
  hybrid: z.object({
    transitionMonths: dist('Months combining the job and freelancing'),
    transitionSalaryFraction: z
      .number()
      .describe('Share of current salary kept during the transition (1 = full-time job)'),
    sideHoursPerWeek: dist('Freelance hours per week during the transition'),
    freelance: z.object(freelanceFields).describe('The freelance business, during and after'),
  }),
} satisfies Record<PathType, z.ZodObject>;

const baselineOutput = z.object({
  currency: z.string().describe('ISO 4217 code, e.g. "USD"'),
  startingCash: z.number().describe('Liquid savings available today'),
  monthlyExpenses: dist('Personal living expenses per month'),
  annualExpenseGrowth: z.number().describe('Yearly expense growth (fraction), e.g. 0.03'),
  currentMonthlyNetSalary: z.number().describe('Current take-home pay per month (0 if none)'),
  otherMonthlyIncome: z.number().describe('Other reliable household income per month'),
  emergencyFloor: z.number().describe('Cash level that counts as running out (usually 0)'),
});

/** Key of the i-th path (0-based) in the output: path_1, path_2, ... */
export const pathKey = (index: number) => `path_${index + 1}`;

/** The output schema for a list of path types, in order. */
export function modelOutputSchemaFor(types: readonly PathType[]) {
  return z.object({
    baseline: baselineOutput,
    paths: z
      .object(Object.fromEntries(types.map((type, i) => [pathKey(i), PATH_OUTPUTS[type]])))
      .describe('One entry per provided path, keyed path_1, path_2, ... in the order given'),
    assumptions: z.array(assumptionSchema),
  });
}

export type PathOutputs = { [T in PathType]: z.output<(typeof PATH_OUTPUTS)[T]> };
export type PathOutput = PathOutputs[PathType];

export interface ModelOutput {
  baseline: z.output<typeof baselineOutput>;
  paths: Record<string, PathOutput>;
  assumptions: z.output<typeof assumptionSchema>[];
}
