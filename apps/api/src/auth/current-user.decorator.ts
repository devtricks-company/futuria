import { type ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth.types.js';

/** Injects the authenticated user's AuthContext (set by AuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (!request.auth) throw new UnauthorizedException();
    return request.auth;
  },
);
