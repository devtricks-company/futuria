import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { type DecisionModelInput, SARA_MODEL, type SimulationDto } from '@futuria/shared';
import { closeTestApp, createTestApp } from './test-app.js';

const DECISION = 'What if I quit my job to become a freelance UX designer?';

describe('Simulations API (e2e)', () => {
  let app: INestApplication<App>;
  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-dev-user', user),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-dev-user', user),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-dev-user', user),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set('x-dev-user', user),
  });
  const alice = () => as('alice');
  const bob = () => as('bob');

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('creates the user on first request with the Free plan', async () => {
    const res = await alice().get('/me').expect(200);
    expect(res.body).toMatchObject({ plan: 'free', usage: { simulationsUsed: 0 } });
    expect(res.body.limits.maxHorizonMonths).toBe(12);
    const again = await alice().get('/me').expect(200);
    expect(again.body.id).toBe(res.body.id);
  });

  it('validates input with structured issues', async () => {
    const res = await alice().post('/simulations').send({ decisionText: 'hi' }).expect(400);
    expect(res.body).toMatchObject({ code: 'validation_failed' });
    expect(res.body.issues[0].path).toBe('decisionText');

    await alice().get('/simulations/not-an-id').expect(400);
  });

  it('runs the full lifecycle: draft -> model_ready -> ready', async () => {
    const created = await alice().post('/simulations').send({ decisionText: DECISION }).expect(201);
    const draft = created.body as SimulationDto;
    expect(draft).toMatchObject({ status: 'draft', title: DECISION, model: null, analysis: null });

    // Running without a model is a conflict, not a crash.
    const early = await alice().post(`/simulations/${draft.id}/run`).expect(409);
    expect(early.body.code).toBe('model_missing');

    const withModel = await alice()
      .patch(`/simulations/${draft.id}/model`)
      .send({ model: SARA_MODEL })
      .expect(200);
    expect(withModel.body.status).toBe('model_ready');
    expect(withModel.body.model.paths).toHaveLength(3);

    const ran = await alice().post(`/simulations/${draft.id}/run`).expect(200);
    const ready = ran.body as SimulationDto;
    expect(ready.status).toBe('ready');
    expect(ready.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ready.analysis!.result.paths.map((p) => p.pathId)).toEqual([
      'stay',
      'freelance',
      'hybrid',
    ]);
    expect(Object.keys(ready.analysis!.byPath).sort()).toEqual(['freelance', 'hybrid', 'stay']);

    // Stored results survive the round trip, including dotted keys in sampled values.
    const fetched = (await alice().get(`/simulations/${draft.id}`).expect(200))
      .body as SimulationDto;
    const freelance = fetched.analysis!.result.paths.find((p) => p.pathId === 'freelance')!;
    expect(freelance.scenarios.realistic.sampled).toHaveProperty(['baseline.monthlyExpenses']);
    expect(fetched.analysis).toEqual(ready.analysis);

    // Re-running uses the stored seed, so results are identical.
    const rerun = (await alice().post(`/simulations/${draft.id}/run`).expect(200))
      .body as SimulationDto;
    expect(rerun.analysis).toEqual(ready.analysis);

    // Editing the model clears results that no longer match it.
    const edited = await alice()
      .patch(`/simulations/${draft.id}/model`)
      .send({ model: { ...SARA_MODEL, paths: SARA_MODEL.paths.slice(0, 2) } })
      .expect(200);
    expect(edited.body).toMatchObject({ status: 'model_ready', analysis: null });
  });

  it('accepts a model at creation and rejects invalid models', async () => {
    const created = await alice()
      .post('/simulations')
      .send({ decisionText: DECISION, title: 'Freelance plan', model: SARA_MODEL })
      .expect(201);
    expect(created.body).toMatchObject({ status: 'model_ready', title: 'Freelance plan' });

    const duplicateIds: DecisionModelInput = {
      ...SARA_MODEL,
      paths: [SARA_MODEL.paths[0]!, { ...SARA_MODEL.paths[0]!, name: 'Copy' }],
    };
    const res = await alice()
      .patch(`/simulations/${created.body.id}/model`)
      .send({ model: duplicateIds })
      .expect(400);
    expect(
      res.body.issues.some((i: { message: string }) => /Duplicate path id/.test(i.message)),
    ).toBe(true);
  });

  it('enforces plan limits on horizon and number of paths', async () => {
    const res = await alice()
      .post('/simulations')
      .send({ decisionText: DECISION, model: { ...SARA_MODEL, horizonMonths: 24 } })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'plan_limit' });
    expect(res.body.message).toContain('12 months');
  });

  it('keeps simulations private to their owner', async () => {
    const created = await alice().post('/simulations').send({ decisionText: DECISION }).expect(201);
    const id = created.body.id as string;

    await bob().get(`/simulations/${id}`).expect(404);
    await bob().patch(`/simulations/${id}/model`).send({ model: SARA_MODEL }).expect(404);
    await bob().post(`/simulations/${id}/run`).expect(404);
    await bob().delete(`/simulations/${id}`).expect(404);

    const bobList = await bob().get('/simulations').expect(200);
    expect(bobList.body).toEqual([]);

    const aliceList = await alice().get('/simulations').expect(200);
    expect(aliceList.body.length).toBeGreaterThanOrEqual(3);
    expect(aliceList.body[0]).toMatchObject({ id, status: 'draft', pathCount: 0 });
  });

  it('deletes simulations', async () => {
    const created = await alice().post('/simulations').send({ decisionText: DECISION }).expect(201);
    await alice().delete(`/simulations/${created.body.id}`).expect(204);
    await alice().get(`/simulations/${created.body.id}`).expect(404);
  });
});
