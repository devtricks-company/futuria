import { z } from 'zod';
import { distributionSchema } from './distribution';

/*
 * The DecisionModel is the contract between Claude (which proposes it), the user (who edits it)
 * and the engine (which simulates it). All money values are monthly amounts in the model's
 * currency; all rates and probabilities are fractions (0.25 = 25%).
 */

const probability = z.number().min(0).max(1);
const fraction = z.number().min(0).max(1);
const money = z.number().min(0);

export const PATH_TYPES = ['stay', 'freelance', 'startup', 'newJob', 'hybrid'] as const;
export type PathType = (typeof PATH_TYPES)[number];

/** The person's financial starting point, shared by every path. */
export const baselineSchema = z.object({
  currency: z.string().length(3).default('USD').describe('ISO 4217 currency code'),
  startingCash: z.number().describe('Liquid savings available today'),
  monthlyExpenses: distributionSchema.describe('Personal living expenses per month'),
  annualExpenseGrowth: z
    .number()
    .min(-0.5)
    .max(1)
    .default(0)
    .describe('Yearly growth of living expenses (inflation / lifestyle), e.g. 0.03'),
  currentMonthlyNetSalary: money.default(0).describe('Current take-home pay per month'),
  otherMonthlyIncome: money.default(0).describe('Other reliable household income per month'),
  emergencyFloor: z
    .number()
    .default(0)
    .describe('Cash level below which the person has "run out of money"'),
});

const pathBase = {
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
};

/** Keep the current job. */
export const stayPathSchema = z.object({
  ...pathBase,
  type: z.literal('stay'),
  annualRaisePct: distributionSchema
    .default({ kind: 'range', low: 0.01, likely: 0.03, high: 0.06 })
    .describe('Yearly raise as a fraction, applied every 12 months'),
  annualLayoffProb: probability.default(0.05).describe('Chance of being laid off in a given year'),
  monthsToReemploy: distributionSchema
    .default({ kind: 'range', low: 1, likely: 3, high: 6 })
    .describe('Months without income after a layoff'),
});

/** Freelance business parameters (used by the freelance and hybrid paths). */
export const freelanceParamsSchema = z.object({
  monthsToFirstClient: distributionSchema.describe('Months with no client revenue'),
  hourlyRate: distributionSchema.describe('Billed hourly rate'),
  billableHoursPerWeek: distributionSchema.describe('Billable hours per week once ramped up'),
  rampMonths: distributionSchema
    .default({ kind: 'range', low: 2, likely: 4, high: 8 })
    .describe('Months from first client to a full workload'),
  initialBookedHoursPerWeek: money
    .default(0)
    .describe('Hours per week already committed by clients before starting'),
  monthlyClientLossProb: probability
    .default(0.08)
    .describe('Chance each month of losing a meaningful part of the workload'),
  businessCostsMonthly: distributionSchema
    .default({ kind: 'fixed', value: 0 })
    .describe('Software, insurance, coworking, accounting per month'),
  taxRate: distributionSchema.describe('Effective tax rate on profit, as a fraction'),
  setupCost: money.default(0).describe('One-off cost in the first month (equipment, legal)'),
  revenueVolatility: fraction
    .default(0.15)
    .describe('Month-to-month revenue noise (standard deviation, as a fraction)'),
});

export const freelancePathSchema = z.object({
  ...pathBase,
  type: z.literal('freelance'),
  ...freelanceParamsSchema.shape,
});

/** Start a company (bootstrapped by default, optionally funded). */
export const startupPathSchema = z.object({
  ...pathBase,
  type: z.literal('startup'),
  monthsToFirstRevenue: distributionSchema.describe('Months before the first paying customer'),
  startingMrr: distributionSchema.describe('Monthly recurring revenue in the first revenue month'),
  monthlyGrowthRate: distributionSchema.describe('Monthly revenue growth as a fraction'),
  monthlyFailureProb: probability
    .default(0.03)
    .describe('Chance each month that the startup shuts down'),
  monthlyBurn: distributionSchema.describe('Business costs per month paid by the founder'),
  taxRate: distributionSchema
    .default({ kind: 'fixed', value: 0.25 })
    .describe('Effective tax rate on profit, as a fraction'),
  setupCost: money.default(0),
  revenueVolatility: fraction.default(0.1),
  fallbackMonthlySalary: distributionSchema
    .optional()
    .describe('Take-home pay of a job taken if the startup fails (omit if none)'),
  monthsToReemploy: distributionSchema
    .default({ kind: 'range', low: 1, likely: 3, high: 6 })
    .describe('Months to find a job after the startup fails'),
  funding: z
    .object({
      probability: probability.describe('Chance of raising a round within the horizon'),
      month: distributionSchema.describe('Month the round closes'),
      founderMonthlySalary: distributionSchema.describe('Founder take-home pay after funding'),
    })
    .optional(),
});

/** Switch to a different job. */
export const newJobPathSchema = z.object({
  ...pathBase,
  type: z.literal('newJob'),
  quitBeforeSearching: z.boolean().default(false),
  monthsToFindJob: distributionSchema.describe('Months until the new job starts'),
  newMonthlyNetSalary: distributionSchema.describe('Take-home pay in the new job'),
  annualRaisePct: distributionSchema.default({ kind: 'fixed', value: 0.03 }),
  signOnBonus: z
    .number()
    .default(0)
    .describe(
      'One-off net amount in the first month of the new job: a bonus (positive) or a cost such as relocation (negative)',
    ),
});

/** Keep (part of) the job while building a freelance business, then go full-time. */
export const hybridPathSchema = z.object({
  ...pathBase,
  type: z.literal('hybrid'),
  transitionMonths: distributionSchema.describe('Months spent combining the job and freelancing'),
  transitionSalaryFraction: fraction
    .default(1)
    .describe('Share of the current salary kept during the transition (1 = full-time job)'),
  sideHoursPerWeek: distributionSchema.describe('Freelance hours per week during the transition'),
  freelance: freelanceParamsSchema,
});

export const pathConfigSchema = z.discriminatedUnion('type', [
  stayPathSchema,
  freelancePathSchema,
  startupPathSchema,
  newJobPathSchema,
  hybridPathSchema,
]);

export const assumptionSchema = z.object({
  id: z.string(),
  pathId: z.string().nullable().describe('Path the assumption belongs to, or null for baseline'),
  field: z.string().describe('Dot path of the model field, e.g. "hourlyRate"'),
  label: z.string(),
  rationale: z.string(),
  source: z.enum(['user', 'ai_estimate', 'default']),
  confidence: z.enum(['low', 'medium', 'high']),
});

export const decisionModelSchema = z
  .object({
    version: z.literal(1).default(1),
    horizonMonths: z.number().int().min(1).max(120).default(12),
    baseline: baselineSchema,
    paths: z.array(pathConfigSchema).min(1).max(8),
    assumptions: z.array(assumptionSchema).default([]),
  })
  .superRefine((model, ctx) => {
    const seen = new Set<string>();
    for (const [i, path] of model.paths.entries()) {
      if (seen.has(path.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate path id "${path.id}"`,
          path: ['paths', i, 'id'],
        });
      }
      seen.add(path.id);
    }
  });

export type Baseline = z.output<typeof baselineSchema>;
export type FreelanceParams = z.output<typeof freelanceParamsSchema>;
export type StayPath = z.output<typeof stayPathSchema>;
export type FreelancePath = z.output<typeof freelancePathSchema>;
export type StartupPath = z.output<typeof startupPathSchema>;
export type NewJobPath = z.output<typeof newJobPathSchema>;
export type HybridPath = z.output<typeof hybridPathSchema>;
export type PathConfig = z.output<typeof pathConfigSchema>;
export type Assumption = z.output<typeof assumptionSchema>;

/** A fully parsed model (defaults applied). This is what the engine works with. */
export type DecisionModel = z.output<typeof decisionModelSchema>;
/** What callers may pass in (defaults optional). */
export type DecisionModelInput = z.input<typeof decisionModelSchema>;
export type PathConfigInput = z.input<typeof pathConfigSchema>;
