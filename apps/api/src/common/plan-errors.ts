import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  type ApiErrorBody,
  PLANS,
  type PlanId,
  type PlanLimits,
  cheapestPlanWhere,
  isBillablePlan,
} from '@futuria/shared';

/** The cheapest plan we sell, above `current`, that satisfies `predicate`. */
export function requiredPlan(
  predicate: (limits: PlanLimits) => boolean,
  current: PlanId,
): PlanId | undefined {
  const plan = cheapestPlanWhere((p) => isBillablePlan(p.id) && predicate(p), current);
  return plan ?? undefined;
}

function forbidden(
  code: string,
  message: string,
  plan?: PlanId,
  extra: Partial<ApiErrorBody> = {},
): ForbiddenException {
  const body: ApiErrorBody = {
    statusCode: 403,
    error: 'Forbidden',
    code,
    message,
    ...(plan ? { requiredPlan: plan } : {}),
    ...extra,
  };
  return new ForbiddenException(body);
}

/** No simulation runs left in this period. */
export function quotaExceeded(plan: PlanId): ForbiddenException {
  const limits = PLANS[plan];
  const upgrade = requiredPlan((p) => p.simulations > limits.simulations, plan);
  const used =
    limits.simulationsPeriod === 'lifetime'
      ? `You've used your ${limits.simulations} free simulations.`
      : `You've used all ${limits.simulations} simulations for this month.`;
  const next = upgrade
    ? ` Upgrade to ${PLANS[upgrade].name} for ${PLANS[upgrade].simulations} a month.`
    : ' Your quota resets at the start of your next billing period.';
  return forbidden('quota_exceeded', used + next, upgrade);
}

export type PlanFeature = keyof PlanLimits['features'];

const FEATURE_NAMES: Record<PlanFeature, string> = {
  pdfExport: 'PDF export',
  storyRefresh: 'Updating the story',
  realityCheck: 'Reality Check',
  askTheFuture: 'Ask the Future',
  advancedVariables: 'Advanced variables',
  teamWorkspace: 'Team workspaces',
  apiAccess: 'API access',
  watermarkedShare: 'Watermarked sharing',
};

/** The feature isn't part of the user's plan. `feature` lets clients pick the right upsell. */
export function planFeatureRequired(feature: PlanFeature, plan: PlanId): ForbiddenException {
  const upgrade = requiredPlan((p) => p.features[feature], plan);
  const where = upgrade ? ` It's included in ${PLANS[upgrade].name}.` : '';
  return forbidden(
    'plan_feature',
    `${FEATURE_NAMES[feature]} isn't part of the ${PLANS[plan].name} plan.${where}`,
    upgrade,
    { feature },
  );
}

/** Signed-out visitors must create an account first (journey step 5). */
export function signupRequired(
  message = 'Create a free account to continue.',
): UnauthorizedException {
  const body: ApiErrorBody = {
    statusCode: 401,
    error: 'Unauthorized',
    code: 'signup_required',
    message,
  };
  return new UnauthorizedException(body);
}

/** An anonymous visitor has as many drafts as we allow before signup. */
export function anonymousDraftLimit(): ForbiddenException {
  const body: ApiErrorBody = {
    statusCode: 403,
    error: 'Forbidden',
    code: 'signup_required',
    message: 'Create a free account to keep exploring decisions.',
  };
  return new ForbiddenException(body);
}
