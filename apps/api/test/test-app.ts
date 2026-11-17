import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PipelineDispatcher } from '../src/pipeline/pipeline.dispatcher.js';

/** Wait until every in-process pipeline run has finished (PIPELINE_MODE=inline). */
export async function settlePipeline(app: INestApplication<App>): Promise<void> {
  await app.get(PipelineDispatcher).drain();
}

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication<App> | undefined): Promise<void> {
  if (!app) return;
  await settlePipeline(app);
  const connection = app.get<Connection>(getConnectionToken());
  if (!connection.name.startsWith('futuria_test_')) {
    throw new Error(`Refusing to drop non-test database "${connection.name}"`);
  }
  // Wait for background index builds; otherwise they can recreate the database after the drop.
  await Promise.all(Object.values(connection.models).map((model) => model.init()));
  await connection.dropDatabase();
  await app.close();
}
