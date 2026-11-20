/**
 * Plan limits and prices (USD). Phase 3 measured about $0.367 of AI per 3-path simulation, so a
 * fully used plan costs: Pro 20 × 0.367 ≈ $7.30 of $19 (≈39%), Premium 60 × 0.367 ≈ $22 of $49
 * (≈45%). Yearly prices are 10× monthly (two months free). Stripe prices are found by
 * `priceLookupKey(plan, interval)`; `pnpm --filter @futuria/api stripe:setup` creates them.
 */
export const PLAN_IDS = ['free', 'pro', 'premium', 'business'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  /** Price of a yearly subscription (0 when there is none). */
  priceUsdYearly: number;
  /**
   * Simulation runs per billing period (Free: lifetime total). A first run and every later
   * re-run ("Update the story", story refresh) each use one.
   */
  simulations: number;
  simulationsPeriod: 'lifetime' | 'month';
  maxHorizonMonths: number;
  maxPaths: number;
  features: {
    pdfExport: boolean;
    storyRefresh: boolean;
    realityCheck: boolean;
    askTheFuture: boolean;
    advancedVariables: boolean;
    teamWorkspace: boolean;
    apiAccess: boolean;
    watermarkedShare: boolean;
  };
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsdMonthly: 0,
    priceUsdYearly: 0,
    simulations: 3,
    simulationsPeriod: 'lifetime',
    maxHorizonMonths: 12,
    maxPaths: 3,
    features: {
      pdfExport: false,
      storyRefresh: false,
      realityCheck: false,
      askTheFuture: false,
      advancedVariables: false,
      teamWorkspace: false,
      apiAccess: false,
      watermarkedShare: true,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsdMonthly: 19,
    priceUsdYearly: 190,
    simulations: 20,
    simulationsPeriod: 'month',
    maxHorizonMonths: 24,
    maxPaths: 5,
    features: {
      pdfExport: true,
      storyRefresh: true,
      realityCheck: true,
      askTheFuture: true,
      advancedVariables: false,
      teamWorkspace: false,
      apiAccess: false,
      watermarkedShare: false,
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceUsdMonthly: 49,
    priceUsdYearly: 490,
    simulations: 60,
    simulationsPeriod: 'month',
    maxHorizonMonths: 60,
    maxPaths: 5,
    features: {
      pdfExport: true,
      storyRefresh: true,
      realityCheck: true,
      askTheFuture: true,
      advancedVariables: true,
      teamWorkspace: false,
      apiAccess: false,
      watermarkedShare: false,
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    priceUsdMonthly: 99,
    priceUsdYearly: 990,
    simulations: 200,
    simulationsPeriod: 'month',
    maxHorizonMonths: 60,
    maxPaths: 8,
    features: {
      pdfExport: true,
      storyRefresh: true,
      realityCheck: true,
      askTheFuture: true,
      advancedVariables: true,
      teamWorkspace: true,
      apiAccess: true,
      watermarkedShare: false,
    },
  },
};

/** Plans sold through Stripe in v1 (Business comes with Phase 10). */
export const BILLABLE_PLANS = ['pro', 'premium'] as const satisfies readonly PlanId[];
export type BillablePlanId = (typeof BILLABLE_PLANS)[number];

export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Price ordering, cheapest first. */
export const PLANS_BY_PRICE: readonly PlanLimits[] = PLAN_IDS.map((id) => PLANS[id]).sort(
  (a, b) => a.priceUsdMonthly - b.priceUsdMonthly,
);

export function isBillablePlan(plan: string): plan is BillablePlanId {
  return (BILLABLE_PLANS as readonly string[]).includes(plan);
}

/** Price in USD for one billing interval. */
export function planPrice(plan: PlanId, interval: BillingInterval): number {
  return interval === 'year' ? PLANS[plan].priceUsdYearly : PLANS[plan].priceUsdMonthly;
}

/** Stripe price lookup key, e.g. `futuria_pro_month`. */
export function priceLookupKey(plan: BillablePlanId, interval: BillingInterval): string {
  return `futuria_${plan}_${interval}`;
}

/** Reverse of `priceLookupKey`; null for keys that aren't ours. */
export function parsePriceLookupKey(
  key: string | null | undefined,
): { plan: BillablePlanId; interval: BillingInterval } | null {
  const match = /^futuria_([a-z]+)_([a-z]+)$/.exec(key ?? '');
  if (!match) return null;
  const [, plan, interval] = match;
  if (!isBillablePlan(plan!) || !(BILLING_INTERVALS as readonly string[]).includes(interval!)) {
    return null;
  }
  return { plan, interval: interval as BillingInterval };
}

/**
 * The cheapest plan, more expensive than `current`, that satisfies `predicate` (null if none).
 * The API puts it in plan errors as `requiredPlan`, the upgrade dialog highlights it.
 */
export function cheapestPlanWhere(
  predicate: (limits: PlanLimits) => boolean,
  current: PlanId = 'free',
): PlanId | null {
  const floor = PLANS[current].priceUsdMonthly;
  return PLANS_BY_PRICE.find((p) => p.priceUsdMonthly > floor && predicate(p))?.id ?? null;
}
