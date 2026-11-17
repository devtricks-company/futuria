import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { Env } from '../config/env.js';
import type { VerifiedIdentity } from './auth.types.js';

/** Verifies Clerk session tokens (JWTs sent as `Authorization: Bearer <token>`). */
@Injectable()
export class TokenVerifier {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(token: string): Promise<VerifiedIdentity> {
    const jwtKey = this.config.get('CLERK_JWT_KEY', { infer: true });
    const secretKey = this.config.get('CLERK_SECRET_KEY', { infer: true });
    const payload = await verifyToken(token, {
      ...(jwtKey ? { jwtKey } : { secretKey }),
      authorizedParties: this.config.get('WEB_ORIGINS', { infer: true }),
    });
    if (!payload.sub) throw new Error('Token has no subject');
    return { externalId: payload.sub };
  }
}
