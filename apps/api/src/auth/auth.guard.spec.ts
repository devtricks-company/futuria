import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Env } from '../config/env.js';
import type { UsersService } from '../users/users.service.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthContext } from './auth.types.js';
import { Public } from './public.decorator.js';
import type { TokenVerifier } from './token-verifier.service.js';

class Routes {
  @Public()
  open() {}

  closed() {}
}

function setup(mode: 'clerk' | 'dev', verify: (token: string) => Promise<{ externalId: string }>) {
  const config = { get: (key: string) => ({ AUTH_MODE: mode, WEB_ORIGINS: [] })[key] };
  const users = { findOrCreate: vi.fn(async () => ({ _id: 'user-object-id', plan: 'free' })) };
  const guard = new AuthGuard(
    new Reflector(),
    config as unknown as ConfigService<Env, true>,
    { verify: vi.fn(verify) } as unknown as TokenVerifier,
    users as unknown as UsersService,
  );
  const run = async (
    headers: Record<string, string>,
    handler: () => void = Routes.prototype.closed,
  ) => {
    const request: { headers: Record<string, string>; auth?: AuthContext } = { headers };
    const context = {
      getHandler: () => handler,
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const allowed = await guard.canActivate(context);
    return { allowed, request };
  };
  return { run, users };
}

describe('AuthGuard', () => {
  it('lets public routes through without credentials', async () => {
    const { run, users } = setup('clerk', async () => ({ externalId: 'x' }));
    const { allowed } = await run({}, Routes.prototype.open);
    expect(allowed).toBe(true);
    expect(users.findOrCreate).not.toHaveBeenCalled();
  });

  describe('clerk mode', () => {
    it('rejects requests without a bearer token', async () => {
      const { run } = setup('clerk', async () => ({ externalId: 'x' }));
      await expect(run({})).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(run({ authorization: 'Basic abc' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects tokens the verifier refuses', async () => {
      const { run } = setup('clerk', async () => {
        throw new Error('expired');
      });
      await expect(run({ authorization: 'Bearer bad' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('attaches the verified user', async () => {
      const { run, users } = setup('clerk', async () => ({ externalId: 'user_123' }));
      const { request } = await run({ authorization: 'Bearer good' });
      expect(users.findOrCreate).toHaveBeenCalledWith('user_123');
      expect(request.auth).toEqual({
        userId: 'user-object-id',
        externalId: 'user_123',
        plan: 'free',
      });
    });
  });

  describe('dev mode', () => {
    it('defaults to dev-user and namespaces dev identities', async () => {
      const { run } = setup('dev', async () => ({ externalId: 'x' }));
      expect((await run({})).request.auth?.externalId).toBe('dev:dev-user');
      expect((await run({ 'x-dev-user': 'alice' })).request.auth?.externalId).toBe('dev:alice');
    });

    it('rejects malformed dev user names', async () => {
      const { run } = setup('dev', async () => ({ externalId: 'x' }));
      await expect(run({ 'x-dev-user': 'not ok!' })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
