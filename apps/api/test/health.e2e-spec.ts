import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { closeTestApp, createTestApp } from './test-app.js';

describe('GET /health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('is public and reports the engine version and database status', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'futuria-api',
      database: 'up',
      ai: 'fixture',
      pipeline: 'inline',
    });
    expect(res.body.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('serves the Inngest endpoint with the simulation-run function, without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/inngest').expect(200);
    // simulation-run plus its onFailure handler, which Inngest registers as a second function.
    expect(res.body).toMatchObject({ function_count: 2, mode: 'dev' });
  });
});
