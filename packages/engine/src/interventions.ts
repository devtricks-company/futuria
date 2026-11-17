import {
  type DecisionModel,
  type DecisionModelInput,
  type HybridPath,
  type InterventionResult,
  type PathConfig,
  fixed,
  freelanceParamsSchema,
  likelyValue,
  range,
  scaleDistribution,
} from '@futuria/shared';
import { cloneModel, findPath, formatMoney } from './model-utils';
import { type AnalysisOptions, DEFAULT_ANALYSIS_RUNS } from './sensitivity';
import { clampRuns, parseModel, summarizePath } from './simulate';

/**
 * Predefined, quantifiable levers for the action plan. The engine measures each lever's impact;
 * Claude only explains it, so every number in the action plan is computed, not invented.
 */
export interface InterventionDefinition {
  id: string;
  label: string;
  applies(model: DecisionModel, path: PathConfig): boolean;
  describe(model: DecisionModel, path: PathConfig): string;
  /** Mutates the given (already cloned) model. */
  apply(model: DecisionModel, path: PathConfig): void;
}

const monthlySurplus = (model: DecisionModel) =>
  model.baseline.currentMonthlyNetSalary - likelyValue(model.baseline.monthlyExpenses);

const freelanceParamsOf = (path: PathConfig) =>
  path.type === 'freelance' ? path : path.type === 'hybrid' ? path.freelance : null;

const SAVE_MONTHS = 2;
const HYBRID_MONTHS = 6;

export const INTERVENTIONS: InterventionDefinition[] = [
  {
    id: 'save_more_first',
    label: `Work ${SAVE_MONTHS} more months and save first`,
    applies: (model, path) => path.type !== 'stay' && monthlySurplus(model) > 0,
    describe: (model) =>
      `Keep your current job ${SAVE_MONTHS} more months and add about ${formatMoney(
        SAVE_MONTHS * monthlySurplus(model),
        model.baseline.currency,
      )} to your savings before you switch.`,
    apply: (model) => {
      model.baseline.startingCash += SAVE_MONTHS * monthlySurplus(model);
    },
  },
  {
    id: 'land_first_client',
    label: 'Land a first client before quitting',
    applies: (_model, path) => freelanceParamsOf(path) !== null,
    describe: (_model, path) => {
      const hours = Math.round(0.25 * likelyValue(freelanceParamsOf(path)!.billableHoursPerWeek));
      return `Sign your first client (about ${hours} hours a week) before you leave your job.`;
    },
    apply: (_model, path) => {
      const p = freelanceParamsOf(path)!;
      p.monthsToFirstClient = fixed(0);
      p.initialBookedHoursPerWeek = Math.max(
        p.initialBookedHoursPerWeek,
        Math.round(0.25 * likelyValue(p.billableHoursPerWeek)),
      );
    },
  },
  {
    id: 'go_hybrid',
    label: `Freelance on the side for ${HYBRID_MONTHS} months first`,
    applies: (model, path) =>
      path.type === 'freelance' && model.baseline.currentMonthlyNetSalary > 0,
    describe: () =>
      `Keep your job for ${HYBRID_MONTHS} months while taking on side projects (about 8 hours a week), then go full-time.`,
    apply: (model, path) => {
      const hybrid: HybridPath = {
        id: path.id,
        name: path.name,
        type: 'hybrid',
        transitionMonths: fixed(HYBRID_MONTHS),
        transitionSalaryFraction: 1,
        sideHoursPerWeek: range(4, 8, 12),
        freelance: freelanceParamsSchema.parse(path),
      };
      model.paths = model.paths.map((p) => (p.id === path.id ? hybrid : p));
    },
  },
  {
    id: 'cut_expenses_15',
    label: 'Cut living expenses by 15%',
    applies: () => true,
    describe: (model) =>
      `Trim about ${formatMoney(
        0.15 * likelyValue(model.baseline.monthlyExpenses),
        model.baseline.currency,
      )} a month from your living expenses.`,
    apply: (model) => {
      model.baseline.monthlyExpenses = scaleDistribution(model.baseline.monthlyExpenses, 0.85);
    },
  },
  {
    id: 'raise_rate_10',
    label: 'Raise your rate by 10%',
    applies: (_model, path) => freelanceParamsOf(path) !== null,
    describe: (model, path) =>
      `Charge about ${formatMoney(
        1.1 * likelyValue(freelanceParamsOf(path)!.hourlyRate),
        model.baseline.currency,
      )} an hour instead of ${formatMoney(
        likelyValue(freelanceParamsOf(path)!.hourlyRate),
        model.baseline.currency,
      )}.`,
    apply: (_model, path) => {
      const p = freelanceParamsOf(path)!;
      p.hourlyRate = scaleDistribution(p.hourlyRate, 1.1);
    },
  },
  {
    id: 'cut_burn_20',
    label: 'Cut business costs by 20%',
    applies: (_model, path) => path.type === 'startup',
    describe: () => 'Reduce monthly business costs by a fifth (tools, contractors, office).',
    apply: (_model, path) => {
      if (path.type === 'startup') path.monthlyBurn = scaleDistribution(path.monthlyBurn, 0.8);
    },
  },
  {
    id: 'search_while_employed',
    label: 'Search while still employed',
    applies: (_model, path) => path.type === 'newJob' && path.quitBeforeSearching,
    describe: () => 'Keep your current job until you have signed the new offer.',
    apply: (_model, path) => {
      if (path.type === 'newJob') path.quitBeforeSearching = false;
    },
  },
];

/** Measure every applicable intervention for one path. Most risk-reducing first. */
export function evaluateInterventions(
  input: DecisionModelInput | DecisionModel,
  pathId: string,
  options: AnalysisOptions,
): InterventionResult[] {
  const model = parseModel(input);
  const runs = clampRuns(options.runs ?? DEFAULT_ANALYSIS_RUNS);
  const seed = options.seed >>> 0;
  const path = findPath(model, pathId);
  const before = summarizePath(model, path, seed, runs);

  return INTERVENTIONS.filter((def) => def.applies(model, path))
    .map((def) => {
      const variant = cloneModel(model);
      def.apply(variant, findPath(variant, pathId));
      const after = summarizePath(variant, findPath(variant, pathId), seed, runs);
      return {
        id: def.id,
        label: def.label,
        description: def.describe(model, path),
        before,
        after,
      } satisfies InterventionResult;
    })
    .sort(
      (a, b) =>
        b.before.probRunOut - b.after.probRunOut - (a.before.probRunOut - a.after.probRunOut) ||
        b.after.medianCashAtHorizon - a.after.medianCashAtHorizon,
    );
}
