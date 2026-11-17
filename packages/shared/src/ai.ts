import { z } from 'zod';
import { PATH_TYPES } from './decision-model';

/*
 * Shapes Claude produces (and the API stores). They double as Claude structured-output
 * formats, so they deliberately carry no numeric or length bounds: structured outputs can't
 * enforce `minimum`/`maxLength`/`maxItems`, and the SDK would then reject an otherwise useful
 * answer client-side. The API normalizes lengths and counts after parsing instead
 * (apps/api/src/ai/normalize.ts) and clamps model numbers (apps/api/src/ai/clamps.ts).
 */

export const INTAKE_CATEGORIES = [
  'freelance',
  'startup',
  'new_job',
  'hybrid',
  'other_career',
  'out_of_scope',
] as const;
export type IntakeCategory = (typeof INTAKE_CATEGORIES)[number];

export const SAFETY_FLAGS = ['none', 'crisis'] as const;
export type SafetyFlag = (typeof SAFETY_FLAGS)[number];

export const INTAKE_QUESTION_KINDS = [
  'money',
  'months',
  'hours',
  'percent',
  'number',
  'boolean',
  'choice',
  'text',
] as const;

/** Model fields an intake answer can feed (dot paths; baseline fields use "baseline."). */
export const INFORMABLE_FIELDS = [
  'baseline.startingCash',
  'baseline.monthlyExpenses',
  'baseline.currentMonthlyNetSalary',
  'baseline.otherMonthlyIncome',
  'baseline.emergencyFloor',
  'annualRaisePct',
  'annualLayoffProb',
  'monthsToReemploy',
  'monthsToFirstClient',
  'hourlyRate',
  'billableHoursPerWeek',
  'rampMonths',
  'initialBookedHoursPerWeek',
  'businessCostsMonthly',
  'taxRate',
  'setupCost',
  'monthsToFirstRevenue',
  'startingMrr',
  'monthlyGrowthRate',
  'monthlyBurn',
  'fallbackMonthlySalary',
  'funding.probability',
  'monthsToFindJob',
  'newMonthlyNetSalary',
  'quitBeforeSearching',
  'signOnBonus',
  'transitionMonths',
  'transitionSalaryFraction',
  'sideHoursPerWeek',
] as const;
export type InformableField = (typeof INFORMABLE_FIELDS)[number];

/** Limits applied to Claude's intake after parsing. */
export const INTAKE_LIMITS = { maxQuestions: 7, minPaths: 2, maxPaths: 3 } as const;

export const intakeQuestionSchema = z.object({
  id: z.string().describe('Short snake_case id, unique within the intake, e.g. "monthly_expenses"'),
  prompt: z.string().describe('The question as shown to the person, one sentence'),
  kind: z.enum(INTAKE_QUESTION_KINDS),
  helpText: z.string().nullable().describe('One short hint, or null'),
  options: z.array(z.string()).describe('Choices for kind "choice"; empty for other kinds'),
  defaultValue: z
    .union([z.number(), z.string(), z.boolean()])
    .nullable()
    .describe('Smart default; percents as fractions (0.25), money as monthly amounts; or null'),
  informs: z
    .enum(INFORMABLE_FIELDS)
    .nullable()
    .describe('The model field this answer feeds, or null if it informs several or none'),
});
export type IntakeQuestion = z.output<typeof intakeQuestionSchema>;

export const proposedPathSchema = z.object({
  id: z.string().describe('Short slug, unique, e.g. "stay", "freelance", "hybrid"'),
  name: z.string().describe('Short, human name, e.g. "Quit & freelance full-time"'),
  type: z.enum(PATH_TYPES),
  summary: z.string().describe('One sentence describing what this path means for the person'),
});
export type ProposedPath = z.output<typeof proposedPathSchema>;

export const intakeResultSchema = z.object({
  inScope: z
    .boolean()
    .describe('True only for career decisions (job, freelancing, starting a business)'),
  category: z.enum(INTAKE_CATEGORIES),
  safetyFlag: z.enum(SAFETY_FLAGS),
  title: z.string().describe('Neutral title for the decision, at most 8 words'),
  questions: z.array(intakeQuestionSchema),
  proposedPaths: z.array(proposedPathSchema),
});
export type IntakeResult = z.output<typeof intakeResultSchema>;

/** Where the intake sends the person: on to the simulator, the waitlist, or support resources. */
export const INTAKE_ROUTINGS = ['ok', 'out_of_scope', 'crisis'] as const;
export type IntakeRouting = (typeof INTAKE_ROUTINGS)[number];

export function intakeRouting(result: Pick<IntakeResult, 'inScope' | 'safetyFlag'>): IntakeRouting {
  if (result.safetyFlag === 'crisis') return 'crisis';
  return result.inScope ? 'ok' : 'out_of_scope';
}

export const intakeAnswerSchema = z.union([z.number(), z.string().max(500), z.boolean()]);
export type IntakeAnswer = z.output<typeof intakeAnswerSchema>;

/** What the simulation stores about the intake conversation. */
export interface SimulationIntake {
  result: IntakeResult;
  routing: IntakeRouting;
  answers: Record<string, IntakeAnswer> | null;
  /** The paths the person kept (possibly renamed or added); null until answered. */
  paths: ProposedPath[] | null;
}

/* ---------- Narrative (Time Machine + action plan) ---------- */

export const milestoneSchema = z.object({
  month: z.number().int().describe('One of the milestone months given in the facts'),
  headline: z.string().describe('One sentence: what this month feels like on this path'),
  events: z.array(z.string()).describe('What happened by now (1-3 items)'),
  opportunities: z.array(z.string()).describe('Openings worth acting on (0-2 items)'),
  challenges: z.array(z.string()).describe('What is hard right now (0-2 items)'),
  risks: z.array(z.string()).describe('What could go wrong next (0-2 items)'),
});
export type Milestone = z.output<typeof milestoneSchema>;

export const actionItemSchema = z.object({
  interventionId: z
    .string()
    .nullable()
    .describe('Id of the engine intervention this action explains, or null'),
  title: z.string(),
  why: z.string().describe('Why it helps, citing the engine impact given in the facts'),
  steps: z.array(z.string()).describe('2-4 concrete next steps'),
});
export type ActionItem = z.output<typeof actionItemSchema>;

export const pathNarrativeSchema = z.object({
  scenarios: z.object({
    optimistic: z.array(milestoneSchema),
    realistic: z.array(milestoneSchema),
    pessimistic: z.array(milestoneSchema),
  }),
  actionPlan: z.array(actionItemSchema),
});
export type PathNarrative = z.output<typeof pathNarrativeSchema>;

/* ---------- Usage and cost ---------- */

export const AI_STEPS = ['intake', 'model', 'narrative'] as const;
export type AiStep = (typeof AI_STEPS)[number];

/** One Claude call, recorded on the simulation for cost measurement. */
export interface AiUsageRecord {
  step: AiStep;
  pathId: string | null;
  provider: 'anthropic' | 'fixture';
  /** The model that served the call (differs from the requested one after a fallback). */
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** Estimated from list prices; null when the model has no known price. */
  costUsd: number | null;
  durationMs: number;
  at: string;
}
