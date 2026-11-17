import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulation, SimulationSchema } from './simulation.schema.js';
import { SimulationsController } from './simulations.controller.js';
import { SimulationsService } from './simulations.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Simulation.name, schema: SimulationSchema }])],
  controllers: [SimulationsController],
  providers: [SimulationsService],
  exports: [SimulationsService],
})
export class SimulationsModule {}
