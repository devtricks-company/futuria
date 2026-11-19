import type { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Connection, Model } from 'mongoose';
import type { App } from 'supertest/types.js';
import type { PlanId } from '@futuria/shared';
import { AppModule } from '../src/app.module.js';
import { PipelineDispatcher } from '../src/pipeline/pipeline.dispatcher.js';
import { User } from '../src/users/user.schema.js';
import { UsersService } from '../src/users/users.service.js';

/** Wait until every in-process pipeline run has finished (PIPELINE_MODE=inline). */
export async function settlePipeline(app: INestApplication<App>): Promise<void> {
  await app.get(PipelineDispatcher).drain();
}

export async function createTestApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication<App>> {
  const moduleRef = await configure(Test.createTestingModule({ imports: [AppModule] })).compile();
  // rawBody, as in main.ts: Stripe webhook signatures are checked against the raw bytes.
  const app = moduleRef.createNestApplication<INestApplication<App>>({ rawBody: true });
  await app.init();
  return app;
}

/** The users collection, for arranging plans and usage in tests. */
export function usersModel(app: INestApplication<App>): Model<User> {
  return app.get<Model<User>>(getModelToken(User.name));
}

/**
 * Put a dev user (`x-dev-user: <name>`) on a plan, optionally with some usage, as a Stripe sync
 * would. Returns the user's id.
 */
export async function setPlan(
  app: INestApplication<App>,
  devUser: string,
  plan: PlanId,
  usage: { simulationsUsed?: number; periodStart?: Date } = {},
): Promise<string> {
  const user = await app.get(UsersService).findOrCreate(`dev:${devUser}`);
  await usersModel(app).updateOne(
    { _id: user._id },
    {
      $set: {
        plan,
        ...(usage.simulationsUsed !== undefined
          ? { 'usage.simulationsUsed': usage.simulationsUsed }
          : {}),
        ...(usage.periodStart ? { 'usage.periodStart': usage.periodStart } : {}),
      },
    },
  );
  return String(user._id);
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
