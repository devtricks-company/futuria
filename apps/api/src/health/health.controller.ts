import { Controller, Get } from '@nestjs/common';
import { ENGINE_VERSION } from '@futuria/engine';

export interface HealthResponse {
  status: 'ok';
  service: 'futuria-api';
  engineVersion: string;
  time: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'futuria-api',
      engineVersion: ENGINE_VERSION,
      time: new Date().toISOString(),
    };
  }
}
