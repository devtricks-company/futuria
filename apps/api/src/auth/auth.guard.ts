import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { signupRequired } from '../common/plan-errors.js';
import type { Env } from '../config/env.js';
import { ClaimService } from '../users/claim.service.js';
import { UsersService } from '../users/users.service.js';
import { ALLOW_ANONYMOUS_KEY } from './allow-anonymous.decorator.js';
import type { AuthContext } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenVerifier } from './token-verifier.service.js';

export const DEV_USER_HEADER = 'x-dev-user';
/** Anonymous visitor id: a random UUID the web app keeps in an httpOnly cookie. */
export const ANON_ID_HEADER = 'x-anon-id';
const DEV_USER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ANON_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Identity {
  externalId: string;
  anonymous: boolean;
}

/**
 * Global guard. Every route requires a user unless marked @Public().
 * - clerk mode: verifies the Clerk session token from the Authorization header.
 * - dev mode (local only): trusts the x-dev-user header, defaulting to "dev-user".
 * - either mode: a request with only an x-anon-id header is an anonymous visitor
 *   ("anon:<uuid>"), allowed on @AllowAnonymous() routes. When a signed-in request also carries
 *   x-anon-id, the visitor's drafts are claimed by the account (journey step 5).
 * The user document is created on first sight.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    private readonly verifier: TokenVerifier,
    private readonly users: UsersService,
    private readonly claims: ClaimService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const anonId = this.anonId(request);
    const identity = await this.resolveIdentity(request, anonId);

    if (identity.anonymous) {
      if (!this.reflector.getAllAndOverride<boolean>(ALLOW_ANONYMOUS_KEY, targets)) {
        throw signupRequired();
      }
      const user = await this.users.findOrCreate(identity.externalId, { anonymous: true });
      request.auth = {
        userId: String(user._id),
        externalId: identity.externalId,
        plan: user.plan,
        anonymous: true,
      };
      return true;
    }

    const user = await this.users.findOrCreate(identity.externalId);
    if (anonId) await this.claims.claim(anonExternalId(anonId), user);
    request.auth = {
      userId: String(user._id),
      externalId: identity.externalId,
      plan: user.plan,
      anonymous: false,
    };
    return true;
  }

  private anonId(request: Request): string | null {
    const header = request.headers[ANON_ID_HEADER];
    if (typeof header !== 'string' || !header.trim()) return null;
    const id = header.trim().toLowerCase();
    if (!ANON_ID_PATTERN.test(id))
      throw new UnauthorizedException(`Invalid ${ANON_ID_HEADER} header`);
    return id;
  }

  private async resolveIdentity(request: Request, anonId: string | null): Promise<Identity> {
    if (this.config.get('AUTH_MODE', { infer: true }) === 'dev') {
      const header = request.headers[DEV_USER_HEADER];
      const named = typeof header === 'string' && header.trim() ? header.trim() : null;
      if (!named && anonId) return { externalId: anonExternalId(anonId), anonymous: true };
      const name = named ?? 'dev-user';
      if (!DEV_USER_PATTERN.test(name)) {
        throw new UnauthorizedException(`Invalid ${DEV_USER_HEADER} header`);
      }
      return { externalId: `dev:${name}`, anonymous: false };
    }

    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) {
      if (anonId) return { externalId: anonExternalId(anonId), anonymous: true };
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      return { externalId: (await this.verifier.verify(token)).externalId, anonymous: false };
    } catch (error) {
      this.logger.debug(`Token rejected: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}

export function anonExternalId(anonId: string): string {
  return `anon:${anonId}`;
}
