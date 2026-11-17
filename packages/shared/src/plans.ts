/**
 * Plan limits. Prices are in USD per month. Simulation quotas are provisional until the real
 * AI cost per simulation is measured (Roadmap Phase 3).
 */
export const PLAN_IDS = ['free', 'pro', 'premium', 'business'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  /** Full simulations per billing period (Free: lifetime total). */
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
    priceUsdMonthly: 12,
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
    priceUsdMonthly: 29,
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
