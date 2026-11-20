import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { Env } from '../config/env.js';
import type { VerifiedIdentity } from './auth.types.js';

/**
 * Clock difference allowed outside production. Clerk's default is 5 s, so on a machine whose clock
 * runs behind, a token minted at sign-in looks "issued in the future" and the first requests after
 * signing in fail with 401. The web proxy (apps/web/src/proxy.ts) allows the same.
 */
const DEV_CLOCK_SKEW_MS = 5 * 60_000;

/** Verifies Clerk session tokens (JWTs sent as `Authorization: Bearer <token>`). */
@Injectable()
export class TokenVerifier {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(token: string): Promise<VerifiedIdentity> {
    const jwtKey = this.config.get('CLERK_JWT_KEY', { infer: true });
    const secretKey = this.config.get('CLERK_SECRET_KEY', { infer: true });
    const production = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const payload = await verifyToken(token, {
      ...(jwtKey ? { jwtKey } : { secretKey }),
      authorizedParties: this.config.get('WEB_ORIGINS', { infer: true }),
      ...(production ? {} : { clockSkewInMs: DEV_CLOCK_SKEW_MS }),
    });
    if (!payload.sub) throw new Error('Token has no subject');
    return { externalId: payload.sub };
  }
}
