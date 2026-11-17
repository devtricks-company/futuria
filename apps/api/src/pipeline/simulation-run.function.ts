import { type Inngest, NonRetriableError } from 'inngest';
import { PermanentPipelineError, type PipelineService } from './pipeline.service.js';
import { RUN_EVENT, type RunJob } from './pipeline.types.js';

/**
 * simulation-run: load ─► engine ─► narrate-<path> (parallel) ─► finalize.
 * 3 retries per step, at most 2 concurrent runs per user, and a global throttle so a burst of
 * runs can't exhaust the Claude rate limit. When retries run out, onFailure marks it failed.
 */
export function createSimulationRunFunction(inngest: Inngest, pipeline: PipelineService) {
  const permanent = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PermanentPipelineError) throw new NonRetriableError(error.message);
      throw error;
    }
  };

  return inngest.createFunction(
    {
      id: 'simulation-run',
      name: 'Simulation run',
      triggers: [{ event: RUN_EVENT }],
      retries: 3,
      concurrency: [{ key: 'event.data.userId', limit: 2 }],
      throttle: { limit: 30, period: '1m' },
      onFailure: async ({ event, error }) => {
        const job = event.data.event.data as RunJob;
        await pipeline.fail(job, error.message || 'The simulation failed.');
      },
    },
    async ({ event, step }) => {
      const job = event.data as RunJob;

      const claimed = await step.run('load', () => pipeline.claim(job));
      if (!claimed) return { status: 'stale' };

      if (claimed.needsEngine) {
        const simulated = await step.run('engine', () => permanent(() => pipeline.runEngine(job)));
        if (!simulated) return { status: 'stale' };
      }

      const stories = await Promise.all(
        claimed.pathIds.map((pathId) =>
          step.run(`narrate-${pathId}`, () => pipeline.narratePath(job, pathId)),
        ),
      );

      const finalized = await step.run('finalize', () => pipeline.finalize(job, stories));
      return { status: finalized ? 'ready' : 'stale' };
    },
  );
}
