import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { InngestService } from './inngest.service.js';
import { PipelineService } from './pipeline.service.js';
import { RUN_EVENT, type RunJob } from './pipeline.types.js';

/** Starts runs: an Inngest event, or the same steps in-process (PIPELINE_MODE=inline). */
@Injectable()
export class PipelineDispatcher implements OnApplicationShutdown {
  private readonly inline: boolean;
  private readonly running = new Set<Promise<void>>();

  constructor(
    config: ConfigService<Env, true>,
    private readonly inngest: InngestService,
    private readonly pipeline: PipelineService,
  ) {
    this.inline = config.get('PIPELINE_MODE', { infer: true }) === 'inline';
  }

  async dispatch(job: RunJob): Promise<void> {
    if (!this.inline) {
      await this.inngest.client.send({ name: RUN_EVENT, data: job });
      return;
    }
    // Respond first (202), then run: the caller polls GET /simulations/:id like with Inngest.
    const run = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.pipeline.runInline(job))
      .finally(() => this.running.delete(run));
    this.running.add(run);
  }

  /** Wait for in-process runs (tests, graceful shutdown). */
  async drain(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.drain();
  }
}
