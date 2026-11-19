import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { SARA_MODEL } from '@futuria/shared';
import { closeTestApp, createTestApp, setPlan, settlePipeline } from './test-app.js';

/* Public share links: owner settings, the stranger's view without amounts, watermarks. */
const DECISION = 'What if I quit my job to become a freelance UX designer?';
/** Shown publicly. In the app it's the title Claude wrote at intake (or the person's own). */
const TITLE = 'Freelance or stay?';
const SLUG = /^[A-Za-z0-9_-]{12}$/;

describe('Sharing (e2e)', () => {
  let app: INestApplication<App>;
  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-dev-user', user),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-dev-user', user),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-dev-user', user),
  });
  /** A stranger: a signed-out visitor with no account and no relation to the owner. */
  const stranger = (url: string) =>
    request(app.getHttpServer()).get(url).set('x-anon-id', randomUUID());

  /** A simulation with Sara's model, run to the end. */
  const finished = async (user: string): Promise<string> => {
    const id = (
      await as(user)
        .post('/simulations')
        .send({ decisionText: DECISION, title: TITLE, model: SARA_MODEL })
        .expect(201)
    ).body.id as string;
    await as(user).post(`/simulations/${id}/run`).expect(202);
    await settlePipeline(app);
    return id;
  };

  const share = (user: string, id: string, body: object) =>
    as(user).post(`/simulations/${id}/share`).send(body);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('needs results before a simulation can be shared', async () => {
    const id = (
      await as('early')
        .post('/simulations')
        .send({ decisionText: DECISION, model: SARA_MODEL })
        .expect(201)
    ).body.id as string;
    const res = await share('early', id, { isPublic: true, showNumbers: false }).expect(409);
    expect(res.body.code).toBe('not_ready');
    // Keeping it private is always fine.
    await share('early', id, { isPublic: false, showNumbers: false }).expect(200);
  });

  it('shares by an unguessable link that shows strangers no amounts', async () => {
    const id = await finished('sam');
    const settings = (await share('sam', id, { isPublic: true, showNumbers: false }).expect(200))
      .body;
    expect(settings).toEqual({
      slug: expect.stringMatching(SLUG),
      isPublic: true,
      showNumbers: false,
    });
    expect((await as('sam').get(`/simulations/${id}`).expect(200)).body.share).toEqual(settings);

    const view = await stranger(`/share/${settings.slug}`).expect(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.body).toMatchObject({
      status: 'ready',
      slug: settings.slug,
      title: TITLE,
      showNumbers: false,
    });
    expect(view.body.details).toBeNull();
    expect(view.body.paths.map((p: { pathId: string }) => p.pathId)).toEqual([
      'stay',
      'freelance',
      'hybrid',
    ]);
    const json = JSON.stringify(view.body);
    expect(json).not.toContain(DECISION);
    expect(json).not.toContain('"model"');
    expect(json).not.toContain('"intake"');
    expect(json).not.toMatch(/(?<![\d.])(18000|5200)(?!\d)/);
  });

  it('keeps the link across changes, shows numbers on request, and can replace the link', async () => {
    const id = await finished('nora');
    const first = (await share('nora', id, { isPublic: true, showNumbers: false }).expect(200))
      .body;
    const again = (await share('nora', id, { isPublic: true, showNumbers: true }).expect(200)).body;
    expect(again.slug).toBe(first.slug);

    const detailed = await stranger(`/share/${first.slug}`).expect(200);
    expect(detailed.body.details.analysis.result.paths).toHaveLength(3);
    expect(detailed.body.chart.startCash).toBe(18000);

    const fresh = (
      await share('nora', id, { isPublic: true, showNumbers: true, newLink: true }).expect(200)
    ).body;
    expect(fresh.slug).toMatch(SLUG);
    expect(fresh.slug).not.toBe(first.slug);
    await stranger(`/share/${first.slug}`).expect(404);
    await stranger(`/share/${fresh.slug}`).expect(200);

    await share('nora', id, { isPublic: false, showNumbers: true }).expect(200);
    const gone = await stranger(`/share/${fresh.slug}`).expect(404);
    expect(gone.body.code).toBe('not_found');
  });

  it('only lets the owner change sharing, and only with an account', async () => {
    const id = await finished('olga');
    const other = await share('mallory', id, { isPublic: true, showNumbers: true }).expect(404);
    expect(other.body.code).toBe('not_found');

    const anonymous = await request(app.getHttpServer())
      .post(`/simulations/${id}/share`)
      .set('x-anon-id', randomUUID())
      .send({ isPublic: true, showNumbers: false })
      .expect(401);
    expect(anonymous.body.code).toBe('signup_required');

    const invalid = await share('olga', id, { isPublic: 'yes' }).expect(400);
    expect(invalid.body.code).toBe('validation_failed');
  });

  it('watermarks shares of Free owners only', async () => {
    const id = await finished('wren');
    const { slug } = (await share('wren', id, { isPublic: true, showNumbers: false }).expect(200))
      .body;
    expect((await stranger(`/share/${slug}`).expect(200)).body.watermark).toBe(true);
    await setPlan(app, 'wren', 'pro');
    expect((await stranger(`/share/${slug}`).expect(200)).body.watermark).toBe(false);
  });

  it('says "updating" while a shared simulation is being changed', async () => {
    await setPlan(app, 'una', 'pro');
    const id = await finished('una');
    const { slug } = (await share('una', id, { isPublic: true, showNumbers: false }).expect(200))
      .body;
    await as('una').patch(`/simulations/${id}/model`).send({ model: SARA_MODEL }).expect(200);
    expect((await stranger(`/share/${slug}`).expect(200)).body).toEqual({
      status: 'updating',
      slug,
      title: expect.any(String),
      watermark: false,
    });
    // Sharing can still be turned off while there are no results.
    await share('una', id, { isPublic: false, showNumbers: false }).expect(200);
    await stranger(`/share/${slug}`).expect(404);
  });

  it('rejects malformed links before looking anything up', async () => {
    const res = await stranger('/share/short').expect(400);
    expect(res.body.code).toBe('validation_failed');
    await stranger('/share/not_a_real_slug_1').expect(404);
  });
});
