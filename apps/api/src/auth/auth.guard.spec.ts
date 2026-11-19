import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Env } from '../config/env.js';
import type { ClaimService } from '../users/claim.service.js';
import type { UsersService } from '../users/users.service.js';
import { AllowAnonymous } from './allow-anonymous.decorator.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthContext } from './auth.types.js';
import { Public } from './public.decorator.js';
import type { TokenVerifier } from './token-verifier.service.js';

class Routes {
  @Public()
  open() {}

  closed() {}

  @AllowAnonymous()
  drafts() {}
}

const ANON = '6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

function setup(mode: 'clerk' | 'dev', verify: (token: string) => Promise<{ externalId: string }>) {
  const config = { get: (key: string) => ({ AUTH_MODE: mode, WEB_ORIGINS: [] })[key] };
  const users = { findOrCreate: vi.fn(async () => ({ _id: 'user-object-id', plan: 'free' })) };
  const claims = { claim: vi.fn(async () => 0) };
  const guard = new AuthGuard(
    new Reflector(),
    config as unknown as ConfigService<Env, true>,
    { verify: vi.fn(verify) } as unknown as TokenVerifier,
    users as unknown as UsersService,
    claims as unknown as ClaimService,
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
  return { run, users, claims };
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
        anonymous: false,
      });
    });

    it('treats a request with only an anonymous id as a visitor on allowed routes', async () => {
      const { run, users } = setup('clerk', async () => ({ externalId: 'x' }));
      const { request } = await run({ 'x-anon-id': ANON }, Routes.prototype.drafts);
      expect(users.findOrCreate).toHaveBeenCalledWith(`anon:${ANON}`, { anonymous: true });
      expect(request.auth).toMatchObject({ externalId: `anon:${ANON}`, anonymous: true });
    });

    it('sends visitors to signup on every other route, without creating a user', async () => {
      const { run, users } = setup('clerk', async () => ({ externalId: 'x' }));
      await expect(run({ 'x-anon-id': ANON })).rejects.toMatchObject({
        response: { code: 'signup_required' },
      });
      expect(users.findOrCreate).not.toHaveBeenCalled();
    });

    it('claims the visitor drafts when a signed-in request carries the anonymous id', async () => {
      const { run, claims } = setup('clerk', async () => ({ externalId: 'user_123' }));
      await run({ authorization: 'Bearer good', 'x-anon-id': ANON.toUpperCase() });
      expect(claims.claim).toHaveBeenCalledWith(`anon:${ANON}`, expect.anything());
    });

    it('rejects malformed anonymous ids', async () => {
      const { run } = setup('clerk', async () => ({ externalId: 'x' }));
      await expect(run({ 'x-anon-id': 'not-a-uuid' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
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

    it('supports anonymous visitors and claiming like clerk mode', async () => {
      const { run, claims } = setup('dev', async () => ({ externalId: 'x' }));
      const visitor = await run({ 'x-anon-id': ANON }, Routes.prototype.drafts);
      expect(visitor.request.auth).toMatchObject({ externalId: `anon:${ANON}`, anonymous: true });
      const named = await run({ 'x-dev-user': 'alice', 'x-anon-id': ANON });
      expect(named.request.auth?.externalId).toBe('dev:alice');
      expect(claims.claim).toHaveBeenCalledWith(`anon:${ANON}`, expect.anything());
    });
  });
});
