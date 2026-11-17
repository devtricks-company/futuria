import { ForbiddenException } from '@nestjs/common';
import { type ApiErrorBody, type DecisionModel, PLANS, type PlanId } from '@futuria/shared';

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
    const body: ApiErrorBody = {
      statusCode: 403,
      error: 'Forbidden',
      code: 'plan_limit',
      message: problems.join(' '),
    };
    throw new ForbiddenException(body);
  }
}
