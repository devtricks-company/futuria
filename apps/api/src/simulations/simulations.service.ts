import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomSeed } from '@futuria/engine';
import {
  type AiUsageRecord,
  type ApiErrorBody,
  BUSY_STATUSES,
  type CreateSimulationRequest,
  type DecisionModel,
  type IntakeAnswersRequest,
  type IntakeRequest,
  PLANS,
  type SimulationDto,
  type SimulationIntake,
  type SimulationStatus,
  type SimulationSummaryDto,
  intakeRouting,
  statusesThatCanReach,
} from '@futuria/shared';
import { toHttpError } from '../ai/ai.errors.js';
import { AI_PROVIDER, type AiProvider } from '../ai/ai.types.js';
import { assembleModel } from '../ai/clamps.js';
import { normalizeIntake } from '../ai/normalize.js';
import { PROMPT_SET_VERSION } from '../ai/prompts/index.js';
import type { AuthContext } from '../auth/auth.types.js';
import { PipelineDispatcher } from '../pipeline/pipeline.dispatcher.js';
import type { RunJob } from '../pipeline/pipeline.types.js';
import { assertModelWithinPlan } from './plan-limits.js';
import { toSimulationDto, toSimulationSummaryDto } from './simulation.mapper.js';
import { Simulation } from './simulation.schema.js';

const LIST_LIMIT = 100;
/** Horizon of AI-built models; people can change it when they edit the model. */
const DEFAULT_HORIZON_MONTHS = 12;

function apiError(statusCode: number, error: string, code: string, message: string): ApiErrorBody {
  return { statusCode, error, code, message };
}

const notFound = () =>
  new NotFoundException(apiError(404, 'Not Found', 'not_found', 'Simulation not found'));

const conflict = (code: string, message: string) =>
  new ConflictException(apiError(409, 'Conflict', code, message));

const ROUTING_CONFLICTS = {
  out_of_scope: () =>
    conflict('out_of_scope', 'FUTURIA can only simulate career decisions for now.'),
  crisis: () =>
    conflict('crisis', 'This decision can’t be simulated. Support resources are available.'),
} as const;

export function deriveTitle(decisionText: string): string {
  const text = decisionText.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 77).trimEnd()}…` : text;
}

interface TransitionOptions {
  set?: Record<string, unknown>;
  push?: AiUsageRecord[];
  /** Extra conditions (e.g. a model must exist); a miss is explained by explainConflict(). */
  filter?: Record<string, unknown>;
}

@Injectable()
export class SimulationsService {
  private readonly logger = new Logger(SimulationsService.name);

  constructor(
    @InjectModel(Simulation.name) private readonly simulations: Model<Simulation>,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly dispatcher: PipelineDispatcher,
  ) {}

  /** Create a simulation directly (optionally with a hand-written model), skipping the AI intake. */
  async create(auth: AuthContext, request: CreateSimulationRequest): Promise<SimulationDto> {
    if (request.model) assertModelWithinPlan(request.model, auth.plan);
    const doc = await this.simulations.create({
      userId: new Types.ObjectId(auth.userId),
      title: request.title ?? deriveTitle(request.decisionText),
      decisionText: request.decisionText,
      status: request.model ? 'model_ready' : 'draft',
      model: request.model ?? null,
      seed: randomSeed(),
    });
    return toSimulationDto(doc.toObject());
  }

  /**
   * Step 1: Claude analyzes the decision (scope, safety, questions, proposed paths). In-scope
   * decisions become intake_ready; out-of-scope and crisis decisions stay drafts with the
   * routing recorded (waitlist demand data / support screen) and go no further.
   */
  async intake(auth: AuthContext, request: IntakeRequest): Promise<SimulationDto> {
    const { output, usage } = await this.callAi(() =>
      this.ai.analyzeIntake({ decisionText: request.decisionText }),
    );
    const result = normalizeIntake(output, request.decisionText);
    const routing = intakeRouting(result);
    const intake: SimulationIntake = { result, routing, answers: null, paths: null };

    const doc = await this.simulations.create({
      userId: new Types.ObjectId(auth.userId),
      title: deriveTitle(result.title || request.decisionText),
      decisionText: request.decisionText,
      status: routing === 'ok' ? 'intake_ready' : 'draft',
      intake,
      seed: randomSeed(),
      aiUsage: [usage],
      promptVersion: PROMPT_SET_VERSION,
    });
    if (routing !== 'ok') this.logger.log(`Intake ${String(doc._id)} routed to ${routing}`);
    return toSimulationDto(doc.toObject());
  }

  /** Step 2: store the answers (and edited paths). The model must be rebuilt afterwards. */
  async saveAnswers(
    auth: AuthContext,
    id: string,
    request: IntakeAnswersRequest,
  ): Promise<SimulationDto> {
    const doc = await this.transition(auth, id, 'intake_ready', {
      filter: { 'intake.routing': 'ok' },
      set: {
        'intake.answers': request.answers,
        ...(request.paths ? { 'intake.paths': request.paths } : {}),
        model: null,
        analysis: null,
        narrative: null,
        error: null,
        lastRunAt: null,
      },
    });
    return toSimulationDto(doc);
  }

  /** Step 3: Claude builds the decision model; the API clamps it and checks plan limits. */
  async buildModel(auth: AuthContext, id: string): Promise<SimulationDto> {
    const doc = await this.simulations.findOne(this.owned(auth, id)).lean().exec();
    if (!doc) throw notFound();
    const intake = doc.intake;
    if (!intake) {
      throw conflict('intake_missing', 'Start with the intake (POST /simulations/intake).');
    }
    if (intake.routing !== 'ok') throw ROUTING_CONFLICTS[intake.routing]();
    if (BUSY_STATUSES.includes(doc.status)) {
      throw conflict(
        'run_in_progress',
        `The simulation is ${doc.status}. Wait for the run to finish.`,
      );
    }

    const limits = PLANS[auth.plan];
    const paths = (intake.paths ?? intake.result.proposedPaths).slice(0, limits.maxPaths);
    const horizonMonths = Math.min(DEFAULT_HORIZON_MONTHS, limits.maxHorizonMonths);
    const { output, usage } = await this.callAi(() =>
      this.ai.buildModel({
        decisionText: doc.decisionText,
        intake: intake.result,
        answers: intake.answers ?? {},
        paths,
        horizonMonths,
      }),
    );

    let model: DecisionModel;
    try {
      const assembled = assembleModel(output, { paths, horizonMonths });
      model = assembled.model;
      if (assembled.adjustments.length > 0) {
        this.logger.log(`Clamped model for ${id}: ${assembled.adjustments.join('; ')}`);
      }
    } catch (error) {
      await this.recordUsage(doc._id, usage);
      throw toHttpError(error);
    }
    assertModelWithinPlan(model, auth.plan);

    const updated = await this.transition(auth, id, 'model_ready', {
      // Only if nothing changed while Claude was working (answers, another build, a run).
      filter: { updatedAt: doc.updatedAt },
      set: {
        model,
        analysis: null,
        narrative: null,
        error: null,
        lastRunAt: null,
        promptVersion: PROMPT_SET_VERSION,
      },
      push: [usage],
    });
    return toSimulationDto(updated);
  }

  async list(auth: AuthContext): Promise<SimulationSummaryDto[]> {
    const docs = await this.simulations
      .find({ userId: new Types.ObjectId(auth.userId) })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .select({
        title: 1,
        status: 1,
        'model.paths.id': 1,
        createdAt: 1,
        updatedAt: 1,
        lastRunAt: 1,
      })
      .lean()
      .exec();
    return docs.map((doc) => toSimulationSummaryDto(doc));
  }

  async get(auth: AuthContext, id: string): Promise<SimulationDto> {
    const doc = await this.simulations.findOne(this.owned(auth, id)).lean().exec();
    if (!doc) throw notFound();
    return toSimulationDto(doc);
  }

  /** Replace the decision model. Previous results no longer match it, so they are cleared. */
  async updateModel(auth: AuthContext, id: string, model: DecisionModel): Promise<SimulationDto> {
    assertModelWithinPlan(model, auth.plan);
    const doc = await this.transition(auth, id, 'model_ready', {
      set: { model, analysis: null, narrative: null, error: null, lastRunAt: null },
    });
    return toSimulationDto(doc);
  }

  /** Queue a full run (engine + narrative). The pipeline moves it on; clients poll GET. */
  async run(auth: AuthContext, id: string): Promise<SimulationDto> {
    return this.enqueue(auth, id, 'full');
  }

  /** Queue a story refresh: new narrative from the existing engine results. */
  async renarrate(auth: AuthContext, id: string): Promise<SimulationDto> {
    return this.enqueue(auth, id, 'narrate');
  }

  async remove(auth: AuthContext, id: string): Promise<void> {
    const result = await this.simulations.deleteOne(this.owned(auth, id)).exec();
    if (result.deletedCount === 0) throw notFound();
  }

  private async enqueue(
    auth: AuthContext,
    id: string,
    mode: RunJob['mode'],
  ): Promise<SimulationDto> {
    const runId = randomUUID();
    const doc = await this.transition(auth, id, 'queued', {
      filter: mode === 'full' ? { model: { $ne: null } } : { analysis: { $ne: null } },
      set: { pipelineRunId: runId, error: null },
    });
    const job: RunJob = { simulationId: id, userId: auth.userId, runId, mode };
    try {
      await this.dispatcher.dispatch(job);
    } catch (error) {
      this.logger.error(`Could not queue run ${runId}: ${(error as Error).message}`);
      const message = 'The simulation queue is unavailable. Please try again.';
      await this.simulations
        .updateOne(
          { _id: doc._id, pipelineRunId: runId, status: 'queued' },
          { $set: { status: 'failed', error: message } },
        )
        .exec();
      throw new ServiceUnavailableException(
        apiError(503, 'Service Unavailable', 'queue_unavailable', message),
      );
    }
    return toSimulationDto(doc);
  }

  /** Run an AI call, mapping AI failures to HTTP errors. */
  private async callAi<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw toHttpError(error);
    }
  }

  private async recordUsage(simulationId: unknown, usage: AiUsageRecord): Promise<void> {
    await this.simulations.updateOne({ _id: simulationId }, { $push: { aiUsage: usage } }).exec();
  }

  /** Owner-only filter: other users' simulations behave exactly like missing ones. */
  private owned(auth: AuthContext, id: string) {
    return { _id: new Types.ObjectId(id), userId: new Types.ObjectId(auth.userId) };
  }

  /** Atomically move a simulation to `to` if its current status (and filter) allow it. */
  private async transition(
    auth: AuthContext,
    id: string,
    to: SimulationStatus,
    { set = {}, push = [], filter = {} }: TransitionOptions,
  ) {
    const doc = await this.simulations
      .findOneAndUpdate(
        { ...this.owned(auth, id), status: { $in: statusesThatCanReach(to) }, ...filter },
        {
          $set: { status: to, ...set },
          ...(push.length > 0 ? { $push: { aiUsage: { $each: push } } } : {}),
        },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (doc) return doc;
    throw await this.explainConflict(auth, id, to, filter);
  }

  private async explainConflict(
    auth: AuthContext,
    id: string,
    to: SimulationStatus,
    filter: Record<string, unknown>,
  ) {
    const current = await this.simulations
      .findOne(this.owned(auth, id))
      .select({ status: 1, model: 1, analysis: 1, intake: 1, updatedAt: 1 })
      .lean()
      .exec();
    if (!current) return notFound();
    if ('intake.routing' in filter) {
      if (!current.intake) {
        return conflict('intake_missing', 'This simulation has no intake to answer.');
      }
      if (current.intake.routing !== 'ok') return ROUTING_CONFLICTS[current.intake.routing]();
    }
    // Most specific first: a run in progress, then what's missing, then the status itself.
    if (BUSY_STATUSES.includes(current.status)) {
      return conflict(
        'run_in_progress',
        `The simulation is ${current.status}. Wait for the run to finish.`,
      );
    }
    if ('model' in filter && !current.model) {
      return conflict('model_missing', 'Add a decision model before running the simulation.');
    }
    if ('analysis' in filter && !current.analysis) {
      return conflict('results_missing', 'Run the simulation before refreshing its story.');
    }
    if (!statusesThatCanReach(to).includes(current.status)) {
      return conflict(
        'invalid_status',
        `A simulation in status "${current.status}" cannot move to "${to}".`,
      );
    }
    return conflict('changed', 'The simulation changed in the meantime. Reload and try again.');
  }
}
