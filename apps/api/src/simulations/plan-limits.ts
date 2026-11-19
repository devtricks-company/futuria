import { ForbiddenException } from '@nestjs/common';
import { type ApiErrorBody, type DecisionModel, PLANS, type PlanId } from '@futuria/shared';
import { requiredPlan } from '../common/plan-errors.js';

/** Reject models that exceed what the user's plan allows (horizon, number of paths). */
export function assertModelWithinPlan(model: DecisionModel, plan: PlanId): void {
  const limits = PLANS[plan];
  const problems: string[] = [];
  if (model.horizonMonths > limits.maxHorizonMonths) {
    problems.push(
      `The ${limits.name} plan simulates up to ${limits.maxHorizonMonths} months (requested ${model.horizonMonths}).`,
    );
  }
  if (model.paths.length > limits.maxPaths) {
    problems.push(
      `The ${limits.name} plan compares up to ${limits.maxPaths} paths (requested ${model.paths.length}).`,
    );
  }
  if (problems.length > 0) {
    const upgrade = requiredPlan(
      (p) => p.maxHorizonMonths >= model.horizonMonths && p.maxPaths >= model.paths.length,
      plan,
    );
    const body: ApiErrorBody = {
      statusCode: 403,
      error: 'Forbidden',
      code: 'plan_limit',
      message: problems.join(' '),
      ...(upgrade ? { requiredPlan: upgrade } : {}),
    };
    throw new ForbiddenException(body);
  }
}
