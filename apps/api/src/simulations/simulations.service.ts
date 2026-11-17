import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ENGINE_VERSION, analyze, randomSeed } from '@futuria/engine';
import {
  type ApiErrorBody,
  type CreateSimulationRequest,
  type DecisionModel,
  type SimulationDto,
  type SimulationStatus,
  type SimulationSummaryDto,
  statusesThatCanReach,
} from '@futuria/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { assertModelWithinPlan } from './plan-limits.js';
import { toSimulationDto, toSimulationSummaryDto } from './simulation.mapper.js';
import { Simulation } from './simulation.schema.js';

const LIST_LIMIT = 100;

function apiError(statusCode: number, error: string, code: string, message: string): ApiErrorBody {
  return { statusCode, error, code, message };
}

const notFound = () =>
  new NotFoundException(apiError(404, 'Not Found', 'not_found', 'Simulation not found'));

const conflict = (code: string, message: string) =>
  new ConflictException(apiError(409, 'Conflict', code, message));

export function deriveTitle(decisionText: string): string {
  const text = decisionText.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 77).trimEnd()}…` : text;
}

@Injectable()
export class SimulationsService {
  private readonly logger = new Logger(SimulationsService.name);

  constructor(@InjectModel(Simulation.name) private readonly simulations: Model<Simulation>) {}

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
      model,
      analysis: null,
      narrative: null,
      error: null,
      lastRunAt: null,
    });
    return toSimulationDto(doc);
  }

  /**
   * Run the engine synchronously (Phase 2). Phase 3 moves this into the Inngest pipeline
   * (queued ─► simulating ─► narrating ─► ready).
   */
  async run(auth: AuthContext, id: string): Promise<SimulationDto> {
    const claimed = await this.transition(
      auth,
      id,
      'simulating',
      { error: null },
      { model: { $ne: null } },
    );

    try {
      const analysis = analyze(claimed.model!, { seed: claimed.seed });
      const done = await this.simulations
        .findOneAndUpdate(
          { _id: claimed._id, status: 'simulating' },
          {
            $set: {
              status: 'ready',
              analysis,
              engineVersion: ENGINE_VERSION,
              lastRunAt: new Date(),
            },
          },
          { returnDocument: 'after' },
        )
        .lean()
        .exec();
      if (!done) throw conflict('changed', 'The simulation changed while it was running.');
      return toSimulationDto(done);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = 'The simulation engine failed on this model.';
      this.logger.error(`${message} (${String(claimed._id)})`, (error as Error).stack);
      await this.simulations
        .updateOne(
          { _id: claimed._id, status: 'simulating' },
          { $set: { status: 'failed', error: message } },
        )
        .exec();
      throw new InternalServerErrorException(
        apiError(500, 'Internal Server Error', 'engine_failed', message),
      );
    }
  }

  async remove(auth: AuthContext, id: string): Promise<void> {
    const result = await this.simulations.deleteOne(this.owned(auth, id)).exec();
    if (result.deletedCount === 0) throw notFound();
  }

  /** Owner-only filter: other users' simulations behave exactly like missing ones. */
  private owned(auth: AuthContext, id: string) {
    return { _id: new Types.ObjectId(id), userId: new Types.ObjectId(auth.userId) };
  }

  /** Atomically move a simulation to `to` if its current status allows it. */
  private async transition(
    auth: AuthContext,
    id: string,
    to: SimulationStatus,
    set: Record<string, unknown>,
    extraFilter: Record<string, unknown> = {},
  ) {
    const doc = await this.simulations
      .findOneAndUpdate(
        { ...this.owned(auth, id), status: { $in: statusesThatCanReach(to) }, ...extraFilter },
        { $set: { status: to, ...set } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (doc) return doc;

    const current = await this.simulations
      .findOne(this.owned(auth, id))
      .select({ status: 1, model: 1 })
      .lean()
      .exec();
    if (!current) throw notFound();
    if (to === 'simulating' && !current.model) {
      throw conflict('model_missing', 'Add a decision model before running the simulation.');
    }
    throw conflict(
      'invalid_status',
      `A simulation in status "${current.status}" cannot move to "${to}".`,
    );
  }
}
