import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PLANS, type PlanId, currentUsagePeriod } from '@futuria/shared';
import { quotaExceeded } from '../common/plan-errors.js';
import { User } from './user.schema.js';

interface UsageState {
  _id: Types.ObjectId;
  plan: PlanId;
  usage: { periodStart: Date; simulationsUsed: number };
}

export interface UsageSnapshot {
  periodStart: Date;
  periodEnd: Date | null;
  simulationsUsed: number;
}

/** What the user's usage looks like right now, as if an overdue monthly roll had happened. */
export function usageSnapshot(user: UsageState, now = new Date()): UsageSnapshot {
  const period = currentUsagePeriod(
    user.usage.periodStart,
    now,
    PLANS[user.plan].simulationsPeriod,
  );
  const rolled = period.start.getTime() !== user.usage.periodStart.getTime();
  return {
    periodStart: period.start,
    periodEnd: period.end,
    simulationsUsed: rolled ? 0 : user.usage.simulationsUsed,
  };
}

const MAX_ATTEMPTS = 4;

/**
 * Simulation quotas. Every run (a first run, a story update, a story refresh) uses one.
 * `consume` is an atomic conditional `$inc`, so concurrent runs can't overspend the quota.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  /** Read-only check before spending AI on new work: 403 quota_exceeded when none are left. */
  async assertCanStart(userId: string): Promise<void> {
    const user = await this.current(userId);
    if (user.usage.simulationsUsed >= PLANS[user.plan].simulations) {
      throw quotaExceeded(user.plan);
    }
  }

  /** Use one simulation run, or throw 403 quota_exceeded. */
  async consume(userId: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const user = await this.current(userId);
      const limit = PLANS[user.plan].simulations;
      if (user.usage.simulationsUsed >= limit) throw quotaExceeded(user.plan);
      const updated = await this.users
        .updateOne(
          {
            _id: user._id,
            plan: user.plan,
            'usage.periodStart': user.usage.periodStart,
            'usage.simulationsUsed': { $lt: limit },
          },
          { $inc: { 'usage.simulationsUsed': 1 } },
        )
        .exec();
      if (updated.modifiedCount === 1) return;
      // The plan, the period or the count changed in the meantime: read again and retry.
    }
    throw quotaExceeded((await this.current(userId)).plan);
  }

  /** Give a run back (the queue was down, or the run failed). */
  async refund(userId: string): Promise<void> {
    const updated = await this.users
      .updateOne(
        { _id: new Types.ObjectId(userId), 'usage.simulationsUsed': { $gt: 0 } },
        { $inc: { 'usage.simulationsUsed': -1 } },
      )
      .exec();
    if (updated.modifiedCount === 1) this.logger.log(`Refunded a simulation run to ${userId}`);
  }

  /** The user's plan and usage, rolling an overdue monthly period first (once, atomically). */
  private async current(userId: string): Promise<UsageState> {
    const user = await this.read(userId);
    const snapshot = usageSnapshot(user);
    if (snapshot.periodStart.getTime() === user.usage.periodStart.getTime()) return user;
    await this.users
      .updateOne(
        { _id: user._id, 'usage.periodStart': user.usage.periodStart },
        { $set: { 'usage.periodStart': snapshot.periodStart, 'usage.simulationsUsed': 0 } },
      )
      .exec();
    return this.read(userId);
  }

  private read(userId: string): Promise<UsageState> {
    return this.users
      .findById(userId)
      .select({ plan: 1, usage: 1 })
      .orFail()
      .lean<UsageState>()
      .exec();
  }
}
