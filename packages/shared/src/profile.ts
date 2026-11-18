import { z } from 'zod';
import type { InformableField } from './ai';

/*
 * The person's saved financial baseline (GET/PUT /me/profile). The web app uses it to pre-fill
 * the intake questions of the next simulation; it is never sent to Claude as-is.
 * Money is monthly unless stated, in `currency`.
 */
export const RISK_TOLERANCES = ['low', 'medium', 'high'] as const;
export type RiskTolerance = (typeof RISK_TOLERANCES)[number];

export const profileSchema = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as USD'),
  /** Monthly take-home pay. */
  netIncome: z.number().min(0).max(1_000_000).nullable(),
  /** Monthly living expenses. */
  expenses: z.number().min(0).max(1_000_000).nullable(),
  /** Savings today (total). */
  savings: z.number().min(-10_000_000).max(100_000_000).nullable(),
  dependents: z.number().int().min(0).max(20).nullable(),
  country: z.string().trim().max(60).nullable(),
  riskTolerance: z.enum(RISK_TOLERANCES).nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileRequestSchema = profileSchema;
export type UpdateProfileRequest = z.input<typeof updateProfileRequestSchema>;

export interface ProfileDto {
  /** Null until the person saves one. */
  profile: Profile | null;
}

export const EMPTY_PROFILE: Profile = {
  currency: 'USD',
  netIncome: null,
  expenses: null,
  savings: null,
  dependents: null,
  country: null,
  riskTolerance: null,
};

/** Which intake question (by its `informs` field) each profile value can pre-fill. */
export const PROFILE_INFORMS: Partial<Record<InformableField, keyof Profile>> = {
  'baseline.startingCash': 'savings',
  'baseline.monthlyExpenses': 'expenses',
  'baseline.currentMonthlyNetSalary': 'netIncome',
};
