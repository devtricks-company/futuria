import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ENGINE_VERSION, analyze } from '@futuria/engine';
import { BUSY_STATUSES, type PathNarrative } from '@futuria/shared';
import { AiError, publicAiMessage } from '../ai/ai.errors.js';
import { AI_PROVIDER, type AiProvider } from '../ai/ai.types.js';
import { ungroundedFigures } from '../ai/grounding.js';
import { buildNarrativeFacts } from '../ai/narrative-facts.js';
import { PROMPT_SET_VERSION } from '../ai/prompts/index.js';
import { Simulation } from '../simulations/simulation.schema.js';
import type { ClaimedRun, PathStory, RunJob } from './pipeline.types.js';

export const ENGINE_FAILED_MESSAGE = 'The simulation engine failed on this model.';

/** Thrown for deterministic failures that retrying can't fix. */
export class PermanentPipelineError extends Error {
  override name = 'PermanentPipelineError';
}

/*
 * The steps of the simulation-run pipeline as plain methods, so they run the same way inside
 * Inngest (durable, retried, one step per call) and inline (tests, local runs without Inngest).
 *
 *   claim ─► engine ─► narrate (one per path, in parallel) ─► finalize      (any error ─► fail)
 *
 * Steps are idempotent and scoped to the run id: re-running a step after a retry is safe, and a
 * stale run finds nothing to update and stops.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @InjectModel(Simulation.name) private readonly simulations: Model<Simulation>,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  private owned(job: RunJob) {
    return { _id: new Types.ObjectId(job.simulationId), pipelineRunId: job.runId };
  }

  /** Step "load": take ownership of the queued simulation. Null means the run is stale. */
  async claim(job: RunJob): Promise<ClaimedRun | null> {
    const full = job.mode === 'full';
    const doc = await this.simulations
      .findOneAndUpdate(
        {
          ...this.owned(job),
          status: { $in: full ? ['queued', 'simulating'] : ['queued', 'narrating'] },
          model: { $ne: null },
          ...(full ? {} : { analysis: { $ne: null } }),
        },
        { $set: { status: full ? 'simulating' : 'narrating', error: null } },
        { returnDocument: 'after' },
      )
      .select({ 'model.paths.id': 1 })
      .lean()
      .exec();
    if (!doc) {
      this.logger.log(`Run ${job.runId} for ${job.simulationId} is stale; skipping.`);
      return null;
    }
    return { pathIds: doc.model!.paths.map((p) => p.id), needsEngine: full };
  }

  /** Step "engine": simulate every path, store the analysis, move on to narrating. */
  async runEngine(job: RunJob): Promise<boolean> {
    const doc = await this.simulations
      .findOne({ ...this.owned(job), status: 'simulating' })
      .select({ model: 1, seed: 1 })
      .lean()
      .exec();
    if (!doc?.model) return false;

    let analysis;
    try {
      analysis = analyze(doc.model, { seed: doc.seed });
    } catch (error) {
      this.logger.error(`${ENGINE_FAILED_MESSAGE} (${job.simulationId})`, (error as Error).stack);
      throw new PermanentPipelineError(ENGINE_FAILED_MESSAGE);
    }
    const updated = await this.simulations
      .updateOne(
        { ...this.owned(job), status: 'simulating' },
        {
          $set: {
            status: 'narrating',
            analysis,
            engineVersion: ENGINE_VERSION,
            lastRunAt: new Date(),
          },
        },
      )
      .exec();
    return updated.modifiedCount === 1;
  }

  /**
   * Step "narrate-<pathId>": write one path's Time Machine. Retryable AI errors are rethrown
   * (with a public message) so Inngest retries; a refusal or misconfiguration leaves this path
   * without a story instead of failing the whole run: the engine results still stand.
   */
  async narratePath(job: RunJob, pathId: string): Promise<PathStory | null> {
    const doc = await this.simulations
      .findOne({ ...this.owned(job), status: 'narrating' })
      .select({ decisionText: 1, model: 1, analysis: 1 })
      .lean()
      .exec();
    if (!doc?.model || !doc.analysis) return null;

    const facts = buildNarrativeFacts(doc.model, doc.analysis, pathId);
    try {
      const { output, usage } = await this.ai.writeNarrative({
        decisionText: doc.decisionText,
        facts,
      });
      const ungrounded = ungroundedFigures(output, facts);
      if (ungrounded.length > 0) {
        this.logger.warn(
          `Narrative for ${job.simulationId}/${pathId} states figures not in the facts: ${ungrounded.join(', ')}`,
        );
      }
      return { pathId, narrative: output, usage, error: null };
    } catch (error) {
      if (error instanceof AiError && !error.retryable) {
        this.logger.warn(
          `No story for ${job.simulationId}/${pathId}: ${error.code} ${error.detail ?? ''}`,
        );
        return { pathId, narrative: null, usage: null, error: publicAiMessage(error) };
      }
      throw new Error(publicAiMessage(error), { cause: error });
    }
  }

  /** Step "finalize": store the stories and usage, mark the simulation ready. */
  async finalize(job: RunJob, stories: (PathStory | null)[]): Promise<boolean> {
    const written = stories.filter((s): s is PathStory => s !== null);
    const narrative: Record<string, PathNarrative> = {};
    for (const story of written) if (story.narrative) narrative[story.pathId] = story.narrative;
    const missing = written.filter((s) => !s.narrative);

    const updated = await this.simulations
      .updateOne(
        { ...this.owned(job), status: 'narrating' },
        {
          $set: {
            status: 'ready',
            narrative,
            promptVersion: PROMPT_SET_VERSION,
            error:
              missing.length > 0
                ? `The story could not be written for: ${missing.map((s) => s.pathId).join(', ')}. ${missing[0]!.error}`
                : null,
          },
          $push: { aiUsage: { $each: written.flatMap((s) => (s.usage ? [s.usage] : [])) } },
        },
      )
      .exec();
    return updated.modifiedCount === 1;
  }

  /** Mark the run failed (after retries are exhausted, or inline on the first error). */
  async fail(job: RunJob, message: string): Promise<void> {
    await this.simulations
      .updateOne(
        { ...this.owned(job), status: { $in: BUSY_STATUSES } },
        { $set: { status: 'failed', error: message } },
      )
      .exec();
  }

  /** All steps in-process, for PIPELINE_MODE=inline. */
  async runInline(job: RunJob): Promise<void> {
    try {
      const claimed = await this.claim(job);
      if (!claimed) return;
      if (claimed.needsEngine && !(await this.runEngine(job))) return;
      const stories = await Promise.all(claimed.pathIds.map((id) => this.narratePath(job, id)));
      await this.finalize(job, stories);
    } catch (error) {
      this.logger.error(`Inline run ${job.runId} failed: ${(error as Error).message}`);
      await this.fail(job, (error as Error).message || 'The simulation failed.');
    }
  }
}
