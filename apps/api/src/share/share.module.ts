import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulation, SimulationSchema } from '../simulations/simulation.schema.js';
import { UsersModule } from '../users/users.module.js';
import { ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';

/** Public share links: settings for owners, a read-only view without amounts for everyone. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Simulation.name, schema: SimulationSchema }]),
    UsersModule,
  ],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
