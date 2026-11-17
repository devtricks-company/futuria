import {
  type ActionItem,
  type Assumption,
  type IntakeAnswer,
  type IntakeCategory,
  type IntakeQuestion,
  type IntakeResult,
  type Milestone,
  type PathNarrative,
  type ProposedPath,
  SCENARIOS,
} from '@futuria/shared';
import { formatMoney } from '@futuria/engine';
import type { BuildModelInput } from './ai.types.js';
import {
  type DistOutput,
  type ModelOutput,
  type PathOutput,
  pathKey,
} from './model-output.schema.js';
import type { NarrativeFacts } from './narrative-facts.js';

/*
 * Deterministic stand-ins for Claude, used by AI_MODE=fixture when no recording matches the
 * input. They exercise every code path (routing, model assembly, grounded narration) without an
 * API call, so tests, CI and offline UI work behave like the real flow. Not meant to be smart.
 */

const CRISIS =
  /\b(suicid\w*|kill (?:my|him|her)self|end (?:my life|it all)|self[- ]?harm\w*|hurt(?:ing)? myself|want to die|point (?:of|in) living)\b/i;
const CAREER =
  /\b(job|jobs|quit\w*|resign\w*|freelanc\w*|consult\w*|contract\w*|start ?ups?|business|company|career|salary|employ\w*|boss|clients?|side hustle|promotion|self-employed)\b/i;

function categorize(text: string): IntakeCategory {
  if (/freelanc|consult|contract|self-employed/i.test(text)) return 'freelance';
  if (/start ?up|start (?:a|my own) (?:business|company)|found(?:er|ing)?\b/i.test(text))
    return 'startup';
  if (
    /new job|switch (?:jobs?|companies)|job offer|another (?:job|company)|change jobs/i.test(text)
  ) {
    return 'new_job';
  }
  return 'other_career';
}

const CORE_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'take_home_pay',
    prompt: 'What is your current monthly take-home pay?',
    kind: 'money',
    helpText: 'After taxes, per month.',
    options: [],
    defaultValue: 5200,
    informs: 'baseline.currentMonthlyNetSalary',
  },
  {
    id: 'monthly_expenses',
    prompt: 'How much do you spend per month on living expenses?',
    kind: 'money',
    helpText: 'Rent, food, transport, subscriptions, debt payments.',
    options: [],
    defaultValue: 3100,
    informs: 'baseline.monthlyExpenses',
  },
  {
    id: 'savings',
    prompt: 'How much savings could you live on if income stopped?',
    kind: 'money',
    helpText: null,
    options: [],
    defaultValue: 18000,
    informs: 'baseline.startingCash',
  },
];

const EXTRA_QUESTIONS: Record<IntakeCategory, IntakeQuestion[]> = {
  freelance: [
    {
      id: 'expected_rate',
      prompt: 'What hourly rate do you expect to charge?',
      kind: 'money',
      helpText: null,
      options: [],
      defaultValue: 55,
      informs: 'hourlyRate',
    },
    {
      id: 'hours_per_week',
      prompt: 'How many hours per week do you expect to bill once established?',
      kind: 'hours',
      helpText: 'Most freelancers bill 15-30 hours per week.',
      options: [],
      defaultValue: 22,
      informs: 'billableHoursPerWeek',
    },
    {
      id: 'months_to_first_client',
      prompt: 'How many months until your first paying client, realistically?',
      kind: 'months',
      helpText: null,
      options: [],
      defaultValue: 2,
      informs: 'monthsToFirstClient',
    },
  ],
  startup: [
    {
      id: 'monthly_burn',
      prompt: 'How much would the business cost per month before it earns money?',
      kind: 'money',
      helpText: null,
      options: [],
      defaultValue: 500,
      informs: 'monthlyBurn',
    },
    {
      id: 'months_to_first_revenue',
      prompt: 'How many months until your first paying customer?',
      kind: 'months',
      helpText: null,
      options: [],
      defaultValue: 6,
      informs: 'monthsToFirstRevenue',
    },
  ],
  new_job: [
    {
      id: 'new_salary',
      prompt: 'What monthly take-home pay do you expect in the new job?',
      kind: 'money',
      helpText: null,
      options: [],
      defaultValue: 5800,
      informs: 'newMonthlyNetSalary',
    },
  ],
  hybrid: [],
  other_career: [],
  out_of_scope: [],
};

const PATHS: Record<IntakeCategory, ProposedPath[]> = {
  freelance: [
    { id: 'stay', name: 'Stay employed', type: 'stay', summary: 'Keep your current job.' },
    {
      id: 'freelance',
      name: 'Quit & freelance full-time',
      type: 'freelance',
      summary: 'Go freelance now.',
    },
    {
      id: 'hybrid',
      name: 'Side-freelance 6 months, then quit',
      type: 'hybrid',
      summary: 'Build clients on the side first.',
    },
  ],
  startup: [
    { id: 'stay', name: 'Stay employed', type: 'stay', summary: 'Keep your current job.' },
    { id: 'startup', name: 'Start the company', type: 'startup', summary: 'Work on it full-time.' },
  ],
  new_job: [
    { id: 'stay', name: 'Stay employed', type: 'stay', summary: 'Keep your current job.' },
    {
      id: 'new-job',
      name: 'Switch jobs',
      type: 'newJob',
      summary: 'Search while employed, then switch.',
    },
  ],
  hybrid: [],
  other_career: [
    { id: 'stay', name: 'Stay employed', type: 'stay', summary: 'Keep your current job.' },
    { id: 'freelance', name: 'Go independent', type: 'freelance', summary: 'Work for yourself.' },
  ],
  out_of_scope: [],
};

export function syntheticIntake(decisionText: string): IntakeResult {
  const title = decisionText.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (CRISIS.test(decisionText)) {
    return {
      inScope: false,
      category: 'out_of_scope',
      safetyFlag: 'crisis',
      title,
      questions: [],
      proposedPaths: [],
    };
  }
  if (!CAREER.test(decisionText)) {
    return {
      inScope: false,
      category: 'out_of_scope',
      safetyFlag: 'none',
      title,
      questions: [],
      proposedPaths: [],
    };
  }
  const category = categorize(decisionText);
  return {
    inScope: true,
    category,
    safetyFlag: 'none',
    title,
    questions: [...CORE_QUESTIONS, ...EXTRA_QUESTIONS[category]],
    proposedPaths: PATHS[category],
  };
}

function numberAnswer(answers: Record<string, IntakeAnswer>, id: string): number | null {
  const value = answers[id];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

/** Claude-style distributions: {low, likely, high}; a repeated number is a known value. */
const r = (low: number, likely: number, high: number): DistOutput => ({ low, likely, high });
const f = (value: number): DistOutput => r(value, value, value);

export function syntheticModel(input: BuildModelInput): ModelOutput {
  const assumptions: Assumption[] = [];
  const pick = (
    id: string,
    fallback: number,
    field: string,
    pathId: string | null,
    label: string,
  ) => {
    const answered = numberAnswer(input.answers, id);
    assumptions.push({
      id: `${pathId ?? 'baseline'}_${id}`,
      pathId,
      field,
      label,
      rationale: answered === null ? 'Typical value for this kind of move.' : 'From your answer.',
      source: answered === null ? 'ai_estimate' : 'user',
      confidence: answered === null ? 'low' : 'high',
    });
    return answered ?? fallback;
  };

  const salary = pick(
    'take_home_pay',
    5200,
    'baseline.currentMonthlyNetSalary',
    null,
    'Take-home pay',
  );
  const expenses = pick(
    'monthly_expenses',
    3100,
    'baseline.monthlyExpenses',
    null,
    'Living expenses',
  );
  const savings = pick('savings', 18000, 'baseline.startingCash', null, 'Savings today');

  const freelanceParams = (pathId: string, prefix = '') => {
    const rate = pick('expected_rate', 55, `${prefix}hourlyRate`, pathId, 'Hourly rate');
    const hours = pick(
      'hours_per_week',
      22,
      `${prefix}billableHoursPerWeek`,
      pathId,
      'Billable hours',
    );
    const first = pick(
      'months_to_first_client',
      2,
      `${prefix}monthsToFirstClient`,
      pathId,
      'First client',
    );
    return {
      monthsToFirstClient: r(Math.max(0, first - 2), first, first + 2),
      hourlyRate: r(Math.round(rate * 0.8), rate, Math.round(rate * 1.25)),
      billableHoursPerWeek: r(Math.max(5, hours - 7), hours, hours + 8),
      rampMonths: r(2, 4, 8),
      initialBookedHoursPerWeek: 0,
      monthlyClientLossProb: 0.08,
      businessCostsMonthly: r(150, 250, 400),
      taxRate: r(0.22, 0.27, 0.32),
      setupCost: 1500,
      revenueVolatility: 0.15,
    };
  };

  const pathParams = (p: ProposedPath): PathOutput => {
    switch (p.type) {
      case 'stay':
        return {
          annualRaisePct: r(0.01, 0.03, 0.06),
          annualLayoffProb: 0.06,
          monthsToReemploy: r(1, 3, 6),
        };
      case 'freelance':
        return freelanceParams(p.id);
      case 'hybrid':
        return {
          transitionMonths: f(6),
          transitionSalaryFraction: 1,
          sideHoursPerWeek: r(4, 8, 12),
          freelance: freelanceParams(p.id, 'freelance.'),
        };
      case 'startup': {
        const burn = pick('monthly_burn', 500, 'monthlyBurn', p.id, 'Business costs');
        const first = pick(
          'months_to_first_revenue',
          6,
          'monthsToFirstRevenue',
          p.id,
          'First revenue',
        );
        return {
          monthsToFirstRevenue: r(Math.max(0, first - 3), first, first + 6),
          startingMrr: r(200, 800, 2500),
          monthlyGrowthRate: r(0.02, 0.08, 0.15),
          monthlyFailureProb: 0.03,
          monthlyBurn: r(Math.round(burn * 0.7), burn, Math.round(burn * 1.5)),
          taxRate: f(0.25),
          setupCost: 2000,
          revenueVolatility: 0.1,
          fallbackMonthlySalary: r(Math.round(salary * 0.8), salary, Math.round(salary * 1.1)),
          monthsToReemploy: r(1, 3, 6),
          funding: null,
        };
      }
      case 'newJob': {
        const next = pick(
          'new_salary',
          Math.round(salary * 1.1),
          'newMonthlyNetSalary',
          p.id,
          'New pay',
        );
        return {
          quitBeforeSearching: false,
          monthsToFindJob: r(1, 3, 6),
          newMonthlyNetSalary: r(Math.round(next * 0.95), next, Math.round(next * 1.05)),
          annualRaisePct: f(0.03),
          signOnBonus: 0,
        };
      }
    }
  };
  const paths = Object.fromEntries(input.paths.map((p, i) => [pathKey(i), pathParams(p)]));

  return {
    baseline: {
      currency: 'USD',
      startingCash: savings,
      monthlyExpenses: r(Math.round(expenses * 0.95), expenses, Math.round(expenses * 1.1)),
      annualExpenseGrowth: 0.03,
      currentMonthlyNetSalary: salary,
      otherMonthlyIncome: 0,
      emergencyFloor: 0,
    },
    paths,
    assumptions,
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function syntheticNarrative(facts: NarrativeFacts): PathNarrative {
  const money = (value: number) => formatMoney(value, facts.currency);
  const scenarios = Object.fromEntries(
    SCENARIOS.map((key) => {
      const scenario = facts.scenarios[key];
      const milestones = scenario.months.map((m): Milestone => {
        const events = scenario.events
          .filter((e) => e.month === m.month)
          .map((e) => e.type.replace(/_/g, ' '));
        return {
          month: m.month,
          headline: `In this ${key} future, month ${m.month} ends with ${money(m.cash)} in savings and ${money(m.income)} of income.`,
          events: events.length > 0 ? events : ['No major change this month.'],
          opportunities: [],
          challenges: m.income < m.expenses ? ['Income does not cover expenses yet.'] : [],
          risks: m.cash < 0 ? ['Savings have run out in this future.'] : [],
        };
      });
      return [key, milestones];
    }),
  ) as PathNarrative['scenarios'];

  const actionPlan: ActionItem[] = [...facts.interventions]
    .sort((a, b) => a.after.probRunOut - b.after.probRunOut)
    .slice(0, 3)
    .map((i) => ({
      interventionId: i.id,
      title: i.label,
      why: `In the simulation, the chance of running out of money goes from ${pct(i.before.probRunOut)} to ${pct(i.after.probRunOut)}.`,
      steps: [i.description],
    }));

  return { scenarios, actionPlan };
}
