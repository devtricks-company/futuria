import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateSimulationRequest,
  type SimulationDto,
  type SimulationSummaryDto,
  type UpdateModelRequest,
  createSimulationRequestSchema,
  objectIdSchema,
  updateModelRequestSchema,
} from '@futuria/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
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

  @Get()
  list(@CurrentUser() auth: AuthContext): Promise<SimulationSummaryDto[]> {
    return this.simulations.list(auth);
  }

  @Get(':id')
  get(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<SimulationDto> {
    return this.simulations.get(auth, id);
  }

  @Patch(':id/model')
  updateModel(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
    @Body({ schema: updateModelRequestSchema }) body: UpdateModelRequest,
  ): Promise<SimulationDto> {
    return this.simulations.updateModel(auth, id, body.model);
  }

  @Post(':id/run')
  @HttpCode(200)
  run(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<SimulationDto> {
    return this.simulations.run(auth, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
  ): Promise<void> {
    return this.simulations.remove(auth, id);
  }
}
