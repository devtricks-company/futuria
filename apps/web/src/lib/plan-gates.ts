import {
  type BillablePlanId,
  type BillingInterval,
  type MeDto,
  PLANS,
  type PlanId,
  type PlanLimits,
  cheapestPlanWhere,
  isBillablePlan,
  planPrice,
} from '@futuria/shared';
import { ApiError } from './api';

/*
 * Plan gates on the client: when to offer an upgrade, which plan to suggest, and what to say.
 * The API enforces every limit; these helpers only make the gate show up before the person
 * spends time (or AI) on something their plan won't run.
 */

export type UpgradeReason =
  'quota' | 'horizon' | 'paths' | 'story' | 'limits' | 'watermark' | 'pdf';

export interface UpgradeRequest {
  reason: UpgradeReason;
  /** The plan to highlight: the cheapest one that allows what was asked. */
  plan: BillablePlanId;
}

/** The cheapest plan we sell, above `current`, that satisfies `predicate`. */
export function upgradeTo(
  predicate: (limits: PlanLimits) => boolean,
  current: PlanId,
): BillablePlanId | null {
  const plan = cheapestPlanWhere((p) => isBillablePlan(p.id) && predicate(p), current);
  return plan && isBillablePlan(plan) ? plan : null;
}

const REASON_BY_CODE: Record<string, UpgradeReason> = {
  quota_exceeded: 'quota',
  plan_feature: 'story',
  plan_limit: 'limits',
};

/** plan_feature errors name the feature; the ones with their own upsell copy. */
const REASON_BY_FEATURE: Partial<Record<keyof PlanLimits['features'], UpgradeReason>> = {
  pdfExport: 'pdf',
  storyRefresh: 'story',
};

/** An upgrade to offer for an API plan error, or null (not a plan error, or nothing to buy). */
export function upgradeFromError(error: unknown): UpgradeRequest | null {
  if (!(error instanceof ApiError) || !error.code) return null;
  const reason =
    (error.code === 'plan_feature' && error.feature && REASON_BY_FEATURE[error.feature]) ||
    REASON_BY_CODE[error.code];
  const plan = error.requiredPlan;
  if (!reason || !plan || !isBillablePlan(plan)) return null;
  return { reason, plan };
}

/** A signed-out visitor hit something that needs an account (journey step 5). */
export function isSignupRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'signup_required';
}

/** Simulation runs left in the current period. */
export function quotaLeft(me: Pick<MeDto, 'limits' | 'usage'>): number {
  return Math.max(0, me.limits.simulations - me.usage.simulationsUsed);
}

/** The plan needed for a horizon, or null when the current plan already allows it. */
export function horizonUpgrade(months: number, plan: PlanId): BillablePlanId | null {
  if (months <= PLANS[plan].maxHorizonMonths) return null;
  return upgradeTo((p) => p.maxHorizonMonths >= months, plan);
}

/** The plan that compares more paths than the current one, if any. */
export function pathsUpgrade(plan: PlanId): BillablePlanId | null {
  return upgradeTo((p) => p.maxPaths > PLANS[plan].maxPaths, plan);
}

/** The plan that can update a finished simulation's story, or null if this plan can. */
export function storyUpgrade(plan: PlanId): BillablePlanId | null {
  if (PLANS[plan].features.storyRefresh) return null;
  return upgradeTo((p) => p.features.storyRefresh, plan);
}

/** The plan that exports PDF reports, or null if this plan can. */
export function pdfUpgrade(plan: PlanId): BillablePlanId | null {
  if (PLANS[plan].features.pdfExport) return null;
  return upgradeTo((p) => p.features.pdfExport, plan);
}

/** The plan whose shared pages carry no watermark, or null if this plan's don't. */
export function watermarkUpgrade(plan: PlanId): BillablePlanId | null {
  if (!PLANS[plan].features.watermarkedShare) return null;
  return upgradeTo((p) => !p.features.watermarkedShare, plan);
}

/** The plan with more simulations, for when the quota is used up. */
export function quotaUpgrade(plan: PlanId): BillablePlanId | null {
  return upgradeTo((p) => p.simulations > PLANS[plan].simulations, plan);
}

export const UPGRADE_COPY: Record<UpgradeReason, { title: string; body: string }> = {
  quota: {
    title: 'You’ve used your simulations',
    body: 'Upgrade to keep exploring decisions. Moving sliders stays free on every plan.',
  },
  horizon: {
    title: 'See further ahead',
    body: 'Simulate your futures over a longer horizon with a paid plan.',
  },
  paths: {
    title: 'Compare more paths',
    body: 'Put more options side by side in one simulation with a paid plan.',
  },
  story: {
    title: 'Update the story with your changes',
    body: 'Paid plans re-run the simulation with your tweaks and rewrite the Time Machine and action plan. Moving sliders stays free.',
  },
  limits: {
    title: 'This simulation needs a bigger plan',
    body: 'Longer horizons and more paths come with a paid plan.',
  },
  pdf: {
    title: 'Download your futures as a PDF',
    body: 'Paid plans export a full report: every path, the chart, what matters most, the Time Machine, the action plan and every assumption.',
  },
  watermark: {
    title: 'Share without the watermark',
    body: 'On paid plans, your shared pages and link previews show your futures without the FUTURIA free-plan watermark.',
  },
};

const FEATURE_LABELS: [keyof PlanLimits['features'], string][] = [
  ['storyRefresh', 'Update the story after tweaks'],
  ['pdfExport', 'PDF reports'],
  ['realityCheck', 'Monthly Reality Check (soon)'],
  ['askTheFuture', 'Ask the Future chat (soon)'],
  ['advancedVariables', 'Taxes, inflation and more variables (soon)'],
];

/** What a plan includes, as short lines for pricing cards. */
export function planHighlights(plan: PlanLimits): string[] {
  const quota =
    plan.simulationsPeriod === 'lifetime'
      ? `${plan.simulations} simulations to start`
      : `${plan.simulations} simulations a month`;
  return [
    quota,
    `Up to ${plan.maxHorizonMonths}-month horizon`,
    `Up to ${plan.maxPaths} options per decision`,
    ...FEATURE_LABELS.filter(([key]) => plan.features[key]).map(([, label]) => label),
  ];
}

/** Price line for a pricing card, e.g. { amount: "$190", per: "a year" }. */
export function priceLabel(plan: PlanId, interval: BillingInterval) {
  return {
    amount: `$${planPrice(plan, interval)}`,
    per: interval === 'year' ? 'a year' : 'a month',
  };
}

/** What a yearly plan saves over 12 monthly payments, in USD. */
export function yearlySavings(plan: PlanId): number {
  return PLANS[plan].priceUsdMonthly * 12 - PLANS[plan].priceUsdYearly;
}

/** Where to send someone who wants a plan: Checkout (signed in) or sign-up first. */
export function upgradeHref(plan: BillablePlanId, interval: BillingInterval): string {
  return `/settings/billing?upgrade=${plan}&interval=${interval}`;
}

/** Read `?upgrade=pro&interval=year` (from the pricing page, possibly after sign-up). */
export function parseUpgradeParams(
  params: Pick<URLSearchParams, 'get'>,
): { plan: BillablePlanId; interval: BillingInterval } | null {
  const plan = params.get('upgrade');
  const interval = params.get('interval') === 'year' ? 'year' : 'month';
  return plan && isBillablePlan(plan) ? { plan, interval } : null;
}
