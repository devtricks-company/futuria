import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { SARA_MODEL, type SimulationDto } from '@futuria/shared';
import { Simulation } from '../src/simulations/simulation.schema.js';
import { closeTestApp, createTestApp, settlePipeline, usersModel } from './test-app.js';

/*
 * Journey step 5: a signed-out visitor drafts a simulation (x-anon-id only), meets the signup
 * gate when running it, and the draft moves to the account on the first signed-in request.
 */
const DECISION = 'What if I quit my job to become a freelance illustrator?';

describe('Anonymous drafts and claiming (e2e)', () => {
  let app: INestApplication<App>;
  const server = () => request(app.getHttpServer());
  const visitor = (anonId: string) => ({
    get: (url: string) => server().get(url).set('x-anon-id', anonId),
    post: (url: string) => server().post(url).set('x-anon-id', anonId),
    patch: (url: string) => server().patch(url).set('x-anon-id', anonId),
    put: (url: string) => server().put(url).set('x-anon-id', anonId),
  });
  const simulations = () => app.get<Model<Simulation>>(getModelToken(Simulation.name));

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('lets a visitor draft and edit, but not run, a simulation', async () => {
    const anon = visitor(randomUUID());
    const me = await anon.get('/me').expect(200);
    expect(me.body).toMatchObject({ anonymous: true, plan: 'free' });

    const started = (await anon.post('/simulations/intake').send({ decisionText: DECISION }))
      .body as SimulationDto;
    expect(started.status).toBe('intake_ready');
    await anon.patch(`/simulations/${started.id}/answers`).send({ answers: {} }).expect(200);
    await anon.post(`/simulations/${started.id}/model`).expect(200);
    await anon.patch(`/simulations/${started.id}/model`).send({ model: SARA_MODEL }).expect(200);
    await anon.get(`/simulations/${started.id}`).expect(200);
    expect((await anon.get('/simulations').expect(200)).body).toHaveLength(1);

    // Drafts of visitors expire unless they sign up.
    const stored = await simulations().findById(started.id).lean();
    expect(stored!.expiresAt).toBeInstanceOf(Date);

    // The signup gate: running (or anything account-only) needs an account.
    const run = await anon.post(`/simulations/${started.id}/run`).expect(401);
    expect(run.body).toMatchObject({ code: 'signup_required' });
    expect((await anon.put('/me/profile').send({}).expect(401)).body.code).toBe('signup_required');
    await anon.post('/simulations').send({ decisionText: DECISION }).expect(401);
    await anon.post('/billing/checkout').send({ plan: 'pro', interval: 'month' }).expect(401);
  });

  it('keeps drafts private to the visitor and caps them before signup', async () => {
    const anon = visitor(randomUUID());
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await anon.post('/simulations/intake').send({ decisionText: DECISION });
      expect(res.status).toBe(201);
      ids.push(res.body.id as string);
    }
    const capped = await anon.post('/simulations/intake').send({ decisionText: DECISION });
    expect(capped.status).toBe(403);
    expect(capped.body.code).toBe('signup_required');

    await visitor(randomUUID()).get(`/simulations/${ids[0]}`).expect(404);
    await server().get(`/simulations/${ids[0]}`).set('x-dev-user', 'stranger').expect(404);
  });

  it('rejects malformed visitor ids', async () => {
    await server().get('/me').set('x-anon-id', 'not-a-uuid').expect(401);
  });

  it('moves the drafts to the account at signup, once', async () => {
    const anonId = randomUUID();
    const anon = visitor(anonId);
    const draft = (
      await anon.post('/simulations/intake').send({ decisionText: DECISION }).expect(201)
    ).body as SimulationDto;
    await anon.patch(`/simulations/${draft.id}/model`).send({ model: SARA_MODEL }).expect(200);

    // First signed-in request with the visitor cookie: the account claims the draft.
    const signedIn = () => server().get('/simulations').set('x-dev-user', 'new-sara');
    const claimed = await signedIn().set('x-anon-id', anonId).expect(200);
    expect(claimed.body.map((s: { id: string }) => s.id)).toEqual([draft.id]);

    const stored = await simulations().findById(draft.id).lean();
    expect(stored!.expiresAt).toBeNull();
    expect(await usersModel(app).countDocuments({ externalId: `anon:${anonId}` })).toBe(0);

    // Idempotent: the same header again changes nothing, and the visitor id now starts fresh.
    await signedIn().set('x-anon-id', anonId).expect(200);
    expect((await signedIn().expect(200)).body).toHaveLength(1);
    expect((await anon.get('/simulations').expect(200)).body).toEqual([]);

    // The account can run its claimed draft.
    const account = (url: string) => server().post(url).set('x-dev-user', 'new-sara');
    await account(`/simulations/${draft.id}/run`).expect(202);
    await settlePipeline(app);
    const ready = await server().get(`/simulations/${draft.id}`).set('x-dev-user', 'new-sara');
    expect(ready.body.status).toBe('ready');
  });

  it('creates TTL indexes for visitors and their drafts', async () => {
    await usersModel(app).init();
    await simulations().init();
    const ttl = (indexes: { key: Record<string, unknown>; expireAfterSeconds?: number }[]) =>
      indexes.find((i) => 'expiresAt' in i.key)?.expireAfterSeconds;
    expect(ttl(await usersModel(app).listIndexes())).toBe(0);
    expect(ttl(await simulations().listIndexes())).toBe(0);
  });
});
