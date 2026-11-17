import type { PlanId } from '@futuria/shared';

/** Attached to every authenticated request as `request.auth`. */
export interface AuthContext {
  /** MongoDB id of the user document. */
  userId: string;
  /** Auth-provider identity (Clerk user id, or "dev:<name>"). */
  externalId: string;
  plan: PlanId;
}

export interface VerifiedIdentity {
  externalId: string;
}
