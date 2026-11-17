import { Controller, Get, NotFoundException } from '@nestjs/common';
import { type MeDto, PLANS } from '@futuria/shared';
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
}
