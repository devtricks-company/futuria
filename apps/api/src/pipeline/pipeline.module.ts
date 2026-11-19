import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulation, SimulationSchema } from '../simulations/simulation.schema.js';
import { UsersModule } from '../users/users.module.js';
import { InngestController } from './inngest.controller.js';
import { InngestService } from './inngest.service.js';
import { PipelineDispatcher } from './pipeline.dispatcher.js';
import { PipelineService } from './pipeline.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Simulation.name, schema: SimulationSchema }]),
    UsersModule,
  ],
  controllers: [InngestController],
  providers: [PipelineService, InngestService, PipelineDispatcher],
  exports: [PipelineDispatcher, PipelineService],
})
export class PipelineModule {}
