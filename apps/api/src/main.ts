import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  // Decision models and results are JSON-heavy; 1 MB is plenty and still bounded.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '1mb' });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.enableCors({ origin: config.get('WEB_ORIGINS', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`FUTURIA API listening on http://localhost:${port}`);
  if (config.get('AUTH_MODE', { infer: true }) === 'dev') {
    logger.warn('AUTH_MODE=dev: requests are trusted via the x-dev-user header (local only).');
  }
}

await bootstrap();
