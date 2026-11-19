import { Body, Controller, Get, NotFoundException, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type MeDto,
  PLANS,
  type Profile,
  type ProfileDto,
  updateProfileRequestSchema,
} from '@futuria/shared';
import { AllowAnonymous } from '../auth/allow-anonymous.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { Env } from '../config/env.js';
import { usageSnapshot } from './usage.service.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @AllowAnonymous()
  async me(@CurrentUser() auth: AuthContext): Promise<MeDto> {
    const user = await this.users.findById(auth.userId);
    if (!user) throw new NotFoundException();
    const usage = usageSnapshot(user);
    const subscription = user.subscription;
    return {
      id: String(user._id),
      plan: user.plan,
      anonymous: user.anonymous,
      usage: {
        periodStart: usage.periodStart.toISOString(),
        periodEnd: usage.periodEnd?.toISOString() ?? null,
        simulationsUsed: usage.simulationsUsed,
      },
      limits: PLANS[user.plan],
      billing: {
        enabled: this.config.get('BILLING_MODE', { infer: true }) === 'stripe',
        subscription: subscription
          ? {
              status: subscription.status,
              interval: subscription.interval,
              currentPeriodEnd: subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toISOString()
                : null,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
      },
    };
  }

  /** The saved financial baseline that pre-fills the next simulation's questions. */
  @Get('profile')
  @AllowAnonymous()
  async profile(@CurrentUser() auth: AuthContext): Promise<ProfileDto> {
    return { profile: await this.users.getProfile(auth.userId) };
  }

  @Put('profile')
  async saveProfile(
    @CurrentUser() auth: AuthContext,
    @Body({ schema: updateProfileRequestSchema }) body: Profile,
  ): Promise<ProfileDto> {
    return { profile: await this.users.saveProfile(auth.userId, body) };
  }
}
