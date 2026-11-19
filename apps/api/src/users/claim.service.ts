import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Simulation } from '../simulations/simulation.schema.js';
import { User, type UserDocument } from './user.schema.js';

/**
 * Journey step 5: when a visitor signs up (or in), the drafts they made while anonymous move to
 * their account. Idempotent: once the anonymous user is gone there is nothing left to claim.
 */
@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Simulation.name) private readonly simulations: Model<Simulation>,
  ) {}

  /** Move everything `anonExternalId` owns to `account`. Returns how many simulations moved. */
  async claim(anonExternalId: string, account: UserDocument): Promise<number> {
    const anon = await this.users
      .findOne({ externalId: anonExternalId, anonymous: true })
      .select({ baseline: 1 })
      .lean()
      .exec();
    if (!anon) return 0;

    const moved = await this.simulations
      .updateMany({ userId: anon._id }, { $set: { userId: account._id, expiresAt: null } })
      .exec();
    if (anon.baseline) {
      await this.users
        .updateOne({ _id: account._id, baseline: null }, { $set: { baseline: anon.baseline } })
        .exec();
    }
    await this.users.deleteOne({ _id: anon._id }).exec();
    if (moved.modifiedCount > 0) {
      this.logger.log(`Claimed ${moved.modifiedCount} draft(s) for user ${String(account._id)}`);
    }
    return moved.modifiedCount;
  }
}
