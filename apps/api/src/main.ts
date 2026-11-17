import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const port = Number(process.env.PORT ?? 4000);
const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: webOrigins, credentials: true });
  app.enableShutdownHooks();
  await app.listen(port);
  Logger.log(`FUTURIA API listening on http://localhost:${port}`, 'Bootstrap');
}

await bootstrap();
