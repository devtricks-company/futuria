import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inngest } from 'inngest';
import type { Env } from '../config/env.js';
import { PipelineService } from './pipeline.service.js';
import { createSimulationRunFunction } from './simulation-run.function.js';

/** The Inngest client and functions, built inside Nest so functions can use Nest services. */
@Injectable()
export class InngestService {
  readonly client: Inngest;
  readonly functions: ReturnType<typeof createSimulationRunFunction>[];

  constructor(config: ConfigService<Env, true>, pipeline: PipelineService) {
    const inline = config.get('PIPELINE_MODE', { infer: true }) === 'inline';
    this.client = new Inngest({
      id: 'futuria-api',
      // Inline mode never sends events; treat it as dev so no cloud keys are required.
      isDev: config.get('INNGEST_DEV', { infer: true }) || inline,
      eventKey: config.get('INNGEST_EVENT_KEY', { infer: true }),
      signingKey: config.get('INNGEST_SIGNING_KEY', { infer: true }),
    });
    this.functions = [createSimulationRunFunction(this.client, pipeline)];
  }
}
