import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { SARA_MODEL } from '@futuria/shared';
import { PipelineDispatcher } from '../src/pipeline/pipeline.dispatcher.js';
import { closeTestApp, createTestApp, setPlan, settlePipeline, usersModel } from './test-app.js';

/* Plan limits: simulation quotas, the paid "Update the story" re-run, and refunds. */
const DECISION = 'What if I quit my job to become a freelance UX designer?';
const DAY = 24 * 60 * 60 * 1000;

describe('Plan limits and usage (e2e)', () => {
  let app: INestApplication<App>;
  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-dev-user', user),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-dev-user', user),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-dev-user', user),
  });

  /** A simulation with Sara's model, ready to run. */
  const ready = async (user: string): Promise<string> =>
    (
      await as(user)
        .post('/simulations')
        .send({ decisionText: DECISION, model: SARA_MODEL })
        .expect(201)
    ).body.id as string;

  const used = async (user: string): Promise<number> =>
    (await as(user).get('/me').expect(200)).body.usage.simulationsUsed as number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await closeTestApp(app);
  });

  it('gives Free 3 simulations in total, then asks for an upgrade', async () => {
    for (let i = 0; i < 3; i += 1) {
      await as('fran')
        .post(`/simulations/${await ready('fran')}/run`)
        .expect(202);
    }
    await settlePipeline(app);
    expect(await used('fran')).toBe(3);

    const fourth = await as('fran')
      .post(`/simulations/${await ready('fran')}/run`)
      .expect(403);
    expect(fourth.body).toMatchObject({ code: 'quota_exceeded', requiredPlan: 'pro' });
    expect(fourth.body.message).toContain('3 free simulations');

    // No AI is spent on a decision that couldn't be run.
    const intake = await as('fran').post('/simulations/intake').send({ decisionText: DECISION });
    expect(intake.status).toBe(403);
    expect(intake.body.code).toBe('quota_exceeded');
  });

  it('keeps "Update the story" (a re-run) and story refresh for paid plans', async () => {
    const id = await ready('rex');
    await as('rex').post(`/simulations/${id}/run`).expect(202);
    await settlePipeline(app);

    const rerun = await as('rex').post(`/simulations/${id}/run`).expect(403);
    expect(rerun.body).toMatchObject({ code: 'plan_feature', requiredPlan: 'pro' });
    // Free keeps finished results: no edits that would clear them (sliders stay local).
    const edit = await as('rex').patch(`/simulations/${id}/model`).send({ model: SARA_MODEL });
    expect(edit.status).toBe(403);
    expect(edit.body.code).toBe('plan_feature');
    const answers = await as('rex').patch(`/simulations/${id}/answers`).send({ answers: {} });
    expect(answers.status).toBe(403);
    expect((await as('rex').get(`/simulations/${id}`).expect(200)).body.analysis).not.toBeNull();
    const refresh = await as('rex').post(`/simulations/${id}/renarrate`).expect(403);
    expect(refresh.body).toMatchObject({ code: 'plan_feature', requiredPlan: 'pro' });
    expect(await used('rex')).toBe(1);

    // On Pro, both work and each uses one run.
    await setPlan(app, 'rex', 'pro');
    await as('rex').post(`/simulations/${id}/run`).expect(202);
    await settlePipeline(app);
    await as('rex').post(`/simulations/${id}/renarrate`).expect(202);
    await settlePipeline(app);
    expect(await used('rex')).toBe(3);
  });

  it('points a full Pro quota to Premium', async () => {
    await setPlan(app, 'pia', 'pro', { simulationsUsed: 20 });
    const res = await as('pia')
      .post(`/simulations/${await ready('pia')}/run`)
      .expect(403);
    expect(res.body).toMatchObject({ code: 'quota_exceeded', requiredPlan: 'premium' });
  });

  it('starts a fresh monthly quota when the period is over', async () => {
    const periodStart = new Date(Date.now() - 40 * DAY);
    const userId = await setPlan(app, 'roll', 'pro', { simulationsUsed: 20, periodStart });

    const me = (await as('roll').get('/me').expect(200)).body;
    expect(me.usage.simulationsUsed).toBe(0);
    expect(new Date(me.usage.periodStart).getTime()).toBeGreaterThan(Date.now() - 31 * DAY);
    expect(new Date(me.usage.periodEnd).getTime()).toBeGreaterThan(Date.now());

    await as('roll')
      .post(`/simulations/${await ready('roll')}/run`)
      .expect(202);
    const stored = await usersModel(app).findById(userId).lean();
    expect(stored!.usage.simulationsUsed).toBe(1);
    expect(stored!.usage.periodStart.getTime()).toBe(new Date(me.usage.periodStart).getTime());
  });

  it('never lets concurrent runs overspend the quota', async () => {
    await setPlan(app, 'race', 'free', { simulationsUsed: 2 });
    const ids = await Promise.all([ready('race'), ready('race'), ready('race')]);
    const results = await Promise.all(ids.map((id) => as('race').post(`/simulations/${id}/run`)));
    expect(results.map((r) => r.status).sort()).toEqual([202, 403, 403]);
    await settlePipeline(app);
    expect(await used('race')).toBe(3);
  });

  it('gives the run back when the queue is down', async () => {
    const id = await ready('qd');
    vi.spyOn(app.get(PipelineDispatcher), 'dispatch').mockRejectedValueOnce(new Error('down'));
    const res = await as('qd').post(`/simulations/${id}/run`).expect(503);
    expect(res.body.code).toBe('queue_unavailable');
    expect(await used('qd')).toBe(0);
  });

  it('answers checkout with billing_disabled when Stripe is not configured', async () => {
    const res = await as('fran')
      .post('/billing/checkout')
      .send({ plan: 'pro', interval: 'month' })
      .expect(503);
    expect(res.body.code).toBe('billing_disabled');
    expect((await as('fran').get('/me').expect(200)).body.billing.enabled).toBe(false);
  });
});
