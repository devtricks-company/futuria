import { Body, Controller, Get, NotFoundException, Put } from '@nestjs/common';
import {
  type MeDto,
  PLANS,
  type Profile,
  type ProfileDto,
  updateProfileRequestSchema,
} from '@futuria/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() auth: AuthContext): Promise<MeDto> {
    const user = await this.users.findById(auth.userId);
    if (!user) throw new NotFoundException();
    return {
      id: String(user._id),
      plan: user.plan,
      usage: {
        periodStart: user.usage.periodStart.toISOString(),
        simulationsUsed: user.usage.simulationsUsed,
      },
      limits: PLANS[user.plan],
    };
  }

  /** The saved financial baseline that pre-fills the next simulation's questions. */
  @Get('profile')
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
