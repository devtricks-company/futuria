import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { stripeProvider } from './stripe.provider.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [BillingController],
  providers: [stripeProvider, BillingService],
  exports: [BillingService],
})
export class BillingModule {}
