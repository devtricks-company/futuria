import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulation, SimulationSchema } from '../simulations/simulation.schema.js';
import { InngestController } from './inngest.controller.js';
import { InngestService } from './inngest.service.js';
import { PipelineDispatcher } from './pipeline.dispatcher.js';
import { PipelineService } from './pipeline.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Simulation.name, schema: SimulationSchema }])],
  controllers: [InngestController],
  providers: [PipelineService, InngestService, PipelineDispatcher],
  exports: [PipelineDispatcher, PipelineService],
})
export class PipelineModule {}
