import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { type Profile, profileSchema } from '@futuria/shared';
import { User, type UserDocument } from './user.schema.js';

const DUPLICATE_KEY = 11000;
/** How long an anonymous visitor (and their drafts) lives without signing up. */
export const ANONYMOUS_TTL_DAYS = 14;

export function anonymousExpiry(now = new Date()): Date {
  return new Date(now.getTime() + ANONYMOUS_TTL_DAYS * 24 * 60 * 60 * 1000);
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  /** Get the user for an auth identity, creating it (Free plan) on first sight. */
  async findOrCreate(
    externalId: string,
    options: { anonymous?: boolean } = {},
  ): Promise<UserDocument> {
    const anonymous = options.anonymous ?? false;
    try {
      return await this.upsert(externalId, anonymous);
    } catch (error) {
      // Two first requests can race on the unique index; the second one just reads.
      if ((error as { code?: number }).code === DUPLICATE_KEY) {
        return this.upsert(externalId, anonymous);
      }
      throw error;
    }
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.users.findById(id).exec();
  }

  /** The saved baseline, or null if the user hasn't saved one (or it no longer validates). */
  async getProfile(id: string): Promise<Profile | null> {
    const user = await this.users.findById(id, { baseline: 1 }).lean().exec();
    if (!user?.baseline) return null;
    const parsed = profileSchema.safeParse(user.baseline);
    return parsed.success ? parsed.data : null;
  }

  async saveProfile(id: string, profile: Profile): Promise<Profile> {
    await this.users
      .updateOne({ _id: id }, { $set: { baseline: profile } })
      .orFail()
      .exec();
    return profile;
  }

  private upsert(externalId: string, anonymous: boolean): Promise<UserDocument> {
    return this.users
      .findOneAndUpdate(
        { externalId },
        {
          $setOnInsert: {
            externalId,
            anonymous,
            expiresAt: anonymous ? anonymousExpiry() : null,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .orFail()
      .exec();
  }
}
