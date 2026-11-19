import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateSimulationRequest,
  type IntakeAnswersRequest,
  type IntakeRequest,
  type SimulationDto,
  type SimulationSummaryDto,
  type UpdateModelRequest,
  createSimulationRequestSchema,
  intakeAnswersRequestSchema,
  intakeRequestSchema,
  objectIdSchema,
  updateModelRequestSchema,
} from '@futuria/shared';
import { AllowAnonymous } from '../auth/allow-anonymous.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PlanGuard, RequiresFeature } from '../auth/plan.guard.js';
import { SimulationsService } from './simulations.service.js';

@Controller('simulations')
export class SimulationsController {
  constructor(private readonly simulations: SimulationsService) {}

  @Post()
  create(
    @CurrentUser() auth: AuthContext,
    @Body({ schema: createSimulationRequestSchema }) body: CreateSimulationRequest,
  ): Promise<SimulationDto> {
    return this.simulations.create(auth, body);
  }

  /** Claude analyzes a free-text decision: scope, safety, questions and proposed paths. */
  @AllowAnonymous()
  @Post('intake')
  intake(
    @CurrentUser() auth: AuthContext,
    @Body({ schema: intakeRequestSchema }) body: IntakeRequest,
  ): Promise<SimulationDto> {
    return this.simulations.intake(auth, body);
  }

  @AllowAnonymous()
  @Get()
  list(@CurrentUser() auth: AuthContext): Promise<SimulationSummaryDto[]> {
    return this.simulations.list(auth);
  }

  @AllowAnonymous()
  @Get(':id')
  get(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<SimulationDto> {
    return this.simulations.get(auth, id);
  }

  @AllowAnonymous()
  @Patch(':id/answers')
  saveAnswers(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
    @Body({ schema: intakeAnswersRequestSchema }) body: IntakeAnswersRequest,
  ): Promise<SimulationDto> {
    return this.simulations.saveAnswers(auth, id, body);
  }

  /** Claude builds the decision model from the intake answers (then clamped server-side). */
  @AllowAnonymous()
  @Post(':id/model')
  @HttpCode(200)
  buildModel(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<SimulationDto> {
    return this.simulations.buildModel(auth, id);
  }

  /** Replace the model with an edited one (assumptions review, sliders). */
  @AllowAnonymous()
  @Patch(':id/model')
  updateModel(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
    @Body({ schema: updateModelRequestSchema }) body: UpdateModelRequest,
  ): Promise<SimulationDto> {
    return this.simulations.updateModel(auth, id, body.model);
  }

  /**
   * Queue the pipeline (engine + narrative). Poll GET /simulations/:id for progress. Uses one
   * simulation run; runs after the first one ("Update the story") need a paid plan.
   */
  @Post(':id/run')
  @HttpCode(202)
  run(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<SimulationDto> {
    return this.simulations.run(auth, id);
  }

  /** Queue a story refresh from the existing engine results (paid plans; uses one run). */
  @Post(':id/renarrate')
  @HttpCode(202)
  @UseGuards(PlanGuard)
  @RequiresFeature('storyRefresh')
  renarrate(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<SimulationDto> {
    return this.simulations.renarrate(auth, id);
  }

  @AllowAnonymous()
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<void> {
    return this.simulations.remove(auth, id);
  }
}
