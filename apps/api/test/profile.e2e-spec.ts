import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { closeTestApp, createTestApp } from './test-app.js';

describe('GET/PUT /me/profile (e2e)', () => {
  let app: INestApplication<App>;
  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-dev-user', user),
    put: (url: string) => request(app.getHttpServer()).put(url).set('x-dev-user', user),
  });

  const SARA = {
    currency: 'usd',
    netIncome: 5200,
    expenses: 3100,
    savings: 18000,
    dependents: 0,
    country: ' Germany ',
    riskTolerance: 'medium',
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('is empty until the user saves one', async () => {
    const res = await as('sara').get('/me/profile').expect(200);
    expect(res.body).toEqual({ profile: null });
  });

  it('saves, normalizes and returns the profile', async () => {
    const saved = await as('sara').put('/me/profile').send(SARA).expect(200);
    expect(saved.body.profile).toEqual({ ...SARA, currency: 'USD', country: 'Germany' });

    const again = await as('sara').get('/me/profile').expect(200);
    expect(again.body.profile).toEqual(saved.body.profile);
  });

  it('keeps profiles private to their owner', async () => {
    const res = await as('someone-else').get('/me/profile').expect(200);
    expect(res.body).toEqual({ profile: null });
  });

  it('rejects invalid values with structured issues', async () => {
    const res = await as('sara')
      .put('/me/profile')
      .send({ ...SARA, currency: 'dollars', dependents: -1 })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    const paths = res.body.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['currency', 'dependents']));
  });

  it('accepts unknown values as null', async () => {
    const res = await as('lean')
      .put('/me/profile')
      .send({
        currency: 'EUR',
        netIncome: null,
        expenses: 2000,
        savings: null,
        dependents: null,
        country: null,
        riskTolerance: null,
      })
      .expect(200);
    expect(res.body.profile).toMatchObject({ currency: 'EUR', expenses: 2000, savings: null });
  });
});
