import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PLANS } from '@futuria/shared';
import { type PlanFeature, planFeatureRequired } from '../common/plan-errors.js';
import type { AuthContext } from './auth.types.js';

export const REQUIRES_FEATURE_KEY = 'futuria:requiresFeature';

/** The route needs a plan feature (checked by PlanGuard, after AuthGuard). */
export const RequiresFeature = (feature: PlanFeature) => SetMetadata(REQUIRES_FEATURE_KEY, feature);

/**
 * Route-level plan gate: answers 403 `plan_feature` (with `requiredPlan`) when the user's plan
 * lacks the feature named by @RequiresFeature(). Quotas are counted by UsageService instead,
 * because they depend on stored usage, not just the plan.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;
    const { auth } = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const plan = auth?.plan ?? 'free';
    if (!PLANS[plan].features[feature]) throw planFeatureRequired(feature, plan);
    return true;
  }
}
