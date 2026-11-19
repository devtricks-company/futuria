import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulation, SimulationSchema } from '../simulations/simulation.schema.js';
import { ClaimService } from './claim.service.js';
import { UsageService } from './usage.service.js';
import { User, UserSchema } from './user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Simulation.name, schema: SimulationSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, ClaimService, UsageService],
  exports: [UsersService, ClaimService, UsageService],
})
export class UsersModule {}
