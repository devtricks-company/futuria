import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module.js';
import { AuthGuard } from './auth.guard.js';
import { TokenVerifier } from './token-verifier.service.js';

@Module({
  imports: [UsersModule],
  providers: [TokenVerifier, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
