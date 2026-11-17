import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { ENGINE_VERSION } from '@futuria/engine';
import { Public } from '../auth/public.decorator.js';

export interface HealthResponse {
  status: 'ok';
  service: 'futuria-api';
  engineVersion: string;
  database: 'up' | 'down';
  time: string;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'futuria-api',
      engineVersion: ENGINE_VERSION,
      // readyState 1 = connected
      database: this.connection.readyState === 1 ? 'up' : 'down',
      time: new Date().toISOString(),
    };
  }
}
