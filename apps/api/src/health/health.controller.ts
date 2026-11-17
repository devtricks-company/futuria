import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { ENGINE_VERSION } from '@futuria/engine';
import { Public } from '../auth/public.decorator.js';
import type { Env } from '../config/env.js';

export interface HealthResponse {
  status: 'ok';
  service: 'futuria-api';
  engineVersion: string;
  database: 'up' | 'down';
  /** "fixture" means no real Claude calls (tests, offline work). */
  ai: Env['AI_MODE'];
  pipeline: Env['PIPELINE_MODE'];
  time: string;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'futuria-api',
      engineVersion: ENGINE_VERSION,
      // readyState 1 = connected
      database: this.connection.readyState === 1 ? 'up' : 'down',
      ai: this.config.get('AI_MODE', { infer: true }),
      pipeline: this.config.get('PIPELINE_MODE', { infer: true }),
      time: new Date().toISOString(),
    };
  }
}
