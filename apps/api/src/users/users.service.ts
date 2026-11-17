import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, type UserDocument } from './user.schema.js';

const DUPLICATE_KEY = 11000;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  /** Get the user for an auth identity, creating it (Free plan) on first sight. */
  async findOrCreate(externalId: string): Promise<UserDocument> {
    try {
      return await this.upsert(externalId);
    } catch (error) {
      // Two first requests can race on the unique index; the second one just reads.
      if ((error as { code?: number }).code === DUPLICATE_KEY) return this.upsert(externalId);
      throw error;
    }
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.users.findById(id).exec();
  }

  private upsert(externalId: string): Promise<UserDocument> {
    return this.users
      .findOneAndUpdate(
        { externalId },
        { $setOnInsert: { externalId } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .orFail()
      .exec();
  }
}
