/*
 * Create the FUTURIA database: collections and indexes for every registered model.
 * Idempotent, so it is safe to run again after schema changes.
 *
 *   pnpm --filter @futuria/api db:setup           # collections + indexes
 *   pnpm --filter @futuria/api db:setup --seed    # also add Sara's sample simulation for dev-user
 */
import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { ENGINE_VERSION, analyze } from '@futuria/engine';
import { SARA_MODEL, decisionModelSchema } from '@futuria/shared';
import { AppModule } from '../app.module.js';
import { Simulation } from '../simulations/simulation.schema.js';
import { UsersService } from '../users/users.service.js';

const NAMESPACE_EXISTS = 48;
const SAMPLE_TITLE = 'Sample: Sara quits to freelance';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

try {
  const connection = app.get<Connection>(getConnectionToken());
  console.log(`Database: ${connection.name} on ${connection.host}:${connection.port}`);

  for (const model of Object.values(connection.models)) {
    try {
      await model.createCollection();
    } catch (error) {
      if ((error as { code?: number }).code !== NAMESPACE_EXISTS) throw error;
    }
    await model.syncIndexes();
    const indexes = await model.listIndexes();
    console.log(
      `  ${model.collection.collectionName}: indexes ${indexes.map((i) => i.name).join(', ')}`,
    );
  }

  if (process.argv.includes('--seed')) {
    const user = await app.get(UsersService).findOrCreate('dev:dev-user');
    const simulations = app.get<Model<Simulation>>(getModelToken(Simulation.name));
    const existing = await simulations.findOne({ userId: user._id, title: SAMPLE_TITLE }).lean();
    if (existing) {
      console.log(`Sample simulation already exists (${String(existing._id)}).`);
    } else {
      const model = decisionModelSchema.parse(SARA_MODEL);
      const seed = 20261116;
      const created = await simulations.create({
        userId: user._id,
        title: SAMPLE_TITLE,
        decisionText: 'What if I quit my job to become a freelance UX designer?',
        status: 'ready',
        model,
        seed,
        analysis: analyze(model, { seed }),
        engineVersion: ENGINE_VERSION,
        lastRunAt: new Date(),
      });
      console.log(`Seeded sample simulation ${String(created._id)} for dev-user.`);
    }
  }

  console.log('Database setup complete.');
} finally {
  await app.close();
}
