import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { SARA_MODEL } from '@futuria/shared';
import { closeTestApp, createTestApp, setPlan, settlePipeline } from './test-app.js';

/* PDF reports: the data route is where the Pro plan is enforced (the web app renders the PDF). */
const DECISION = 'What if I quit my job to become a freelance UX designer?';

describe('PDF report data (e2e)', () => {
  let app: INestApplication<App>;
  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-dev-user', user),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-dev-user', user),
  });

  const draft = async (user: string): Promise<string> =>
    (
      await as(user)
        .post('/simulations')
        .send({ decisionText: DECISION, model: SARA_MODEL })
        .expect(201)
    ).body.id as string;

  const finished = async (user: string): Promise<string> => {
    const id = await draft(user);
    await as(user).post(`/simulations/${id}/run`).expect(202);
    await settlePipeline(app);
    return id;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('is a Pro feature, and says which feature was refused', async () => {
    const id = await finished('freya');
    const res = await as('freya').get(`/simulations/${id}/report`).expect(403);
    expect(res.body).toMatchObject({
      code: 'plan_feature',
      feature: 'pdfExport',
      requiredPlan: 'pro',
    });
    expect(res.body.message).toContain('PDF export');
  });

  it('gives Pro owners the full simulation, once it has results', async () => {
    await setPlan(app, 'paul', 'pro');
    const early = await as('paul')
      .get(`/simulations/${await draft('paul')}/report`)
      .expect(409);
    expect(early.body.code).toBe('not_ready');

    const id = await finished('paul');
    const res = await as('paul').get(`/simulations/${id}/report`).expect(200);
    expect(res.body).toMatchObject({ id, status: 'ready', decisionText: DECISION });
    expect(res.body.analysis.result.paths).toHaveLength(3);
    expect(res.body.model.paths).toHaveLength(3);
  });

  it("never exports someone else's simulation, and needs an account", async () => {
    const id = await finished('olive');
    await setPlan(app, 'peter', 'pro');
    const other = await as('peter').get(`/simulations/${id}/report`).expect(404);
    expect(other.body.code).toBe('not_found');

    const anonymous = await request(app.getHttpServer())
      .get(`/simulations/${id}/report`)
      .set('x-anon-id', randomUUID())
      .expect(401);
    expect(anonymous.body.code).toBe('signup_required');
  });
});
