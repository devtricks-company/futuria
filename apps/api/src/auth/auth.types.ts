import type { PlanId } from '@futuria/shared';

/** Attached to every authenticated request as `request.auth`. */
export interface AuthContext {
  /** MongoDB id of the user document. */
  userId: string;
  /** Auth-provider identity (Clerk user id, "dev:<name>", or "anon:<uuid>"). */
  externalId: string;
  plan: PlanId;
  /**
   * A signed-out visitor identified by the web app's anonymous cookie. Anonymous users can only
   * reach routes marked @AllowAnonymous() (the wizard up to the signup gate).
   */
  anonymous: boolean;
}

export interface VerifiedIdentity {
  externalId: string;
}
