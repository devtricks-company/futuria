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
import type { Env } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import type { AuthContext } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenVerifier } from './token-verifier.service.js';

export const DEV_USER_HEADER = 'x-dev-user';
const DEV_USER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Global guard. Every route requires a user unless marked @Public().
 * - clerk mode: verifies the Clerk session token from the Authorization header.
 * - dev mode (local only): trusts the x-dev-user header, defaulting to "dev-user".
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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const externalId = await this.resolveIdentity(request);
    const user = await this.users.findOrCreate(externalId);
    request.auth = { userId: String(user._id), externalId, plan: user.plan };
    return true;
  }

  private async resolveIdentity(request: Request): Promise<string> {
    if (this.config.get('AUTH_MODE', { infer: true }) === 'dev') {
      const header = request.headers[DEV_USER_HEADER];
      const name = typeof header === 'string' && header.trim() ? header.trim() : 'dev-user';
      if (!DEV_USER_PATTERN.test(name)) {
        throw new UnauthorizedException(`Invalid ${DEV_USER_HEADER} header`);
      }
      return `dev:${name}`;
    }

    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      return (await this.verifier.verify(token)).externalId;
    } catch (error) {
      this.logger.debug(`Token rejected: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
