import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ApiErrorBody, ShareRequest, ShareSettingsDto, ShareViewDto } from '@futuria/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { toShareSettings } from '../simulations/simulation.mapper.js';
import { Simulation } from '../simulations/simulation.schema.js';
import { UsersService } from '../users/users.service.js';
import { type SharedSimulation, toShareView } from './share.mapper.js';

const DUPLICATE_KEY = 11000;
const SLUG_ATTEMPTS = 3;

/** 72 random bits as 12 URL-safe characters: unguessable, so links can't be enumerated. */
export function newShareSlug(): string {
  return randomBytes(9).toString('base64url');
}

const notFound = (message: string) =>
  new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    code: 'not_found',
    message,
  } satisfies ApiErrorBody);

type Owned = { _id: Types.ObjectId; userId: Types.ObjectId };

@Injectable()
export class ShareService {
  constructor(
    @InjectModel(Simulation.name) private readonly simulations: Model<Simulation>,
    private readonly users: UsersService,
  ) {}

  /**
   * Change a simulation's share settings (owner only). Making it public needs results; the link
   * (slug) is created on first share and kept, unless `newLink` asks for a fresh one. Turning
   * sharing off always works, even while a run is in progress.
   */
  async update(auth: AuthContext, id: string, body: ShareRequest): Promise<ShareSettingsDto> {
    const owned: Owned = {
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(auth.userId),
    };
    const doc = await this.simulations
      .findOneAndUpdate(
        body.isPublic ? { ...owned, analysis: { $ne: null } } : owned,
        { $set: { 'share.isPublic': body.isPublic, 'share.showNumbers': body.showNumbers } },
        { returnDocument: 'after', projection: { share: 1 } },
      )
      .lean()
      .exec();
    if (!doc) {
      if (!(await this.simulations.exists(owned).exec())) throw notFound('Simulation not found');
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'not_ready',
        message: 'Run the simulation before sharing it.',
      } satisfies ApiErrorBody);
    }

    const replace = body.newLink === true;
    const needsSlug = replace || (body.isPublic && !doc.share?.slug);
    const slug = needsSlug ? await this.assignSlug(owned, replace) : doc.share?.slug;
    return toShareSettings({ ...doc.share, slug: slug ?? null });
  }

  /** The public view of a shared simulation, for anyone with the link. */
  async getPublic(slug: string): Promise<ShareViewDto> {
    const doc = await this.simulations
      .findOne({ 'share.slug': slug, 'share.isPublic': true })
      .select({ userId: 1, title: 1, model: 1, analysis: 1, narrative: 1, share: 1, lastRunAt: 1 })
      .lean<SharedSimulation & { userId: Types.ObjectId }>()
      .exec();
    if (!doc) throw notFound('This link is not shared');
    const owner = await this.users.findById(String(doc.userId));
    return toShareView(doc, owner?.plan ?? 'free');
  }

  /**
   * Give the simulation a new random slug. Without `replace`, only if it has none yet (a request
   * running at the same time may have just set one: that one wins). Retries on the rare
   * collision with another simulation's slug.
   */
  private async assignSlug(owned: Owned, replace: boolean): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      const slug = newShareSlug();
      try {
        const res = await this.simulations
          .updateOne(replace ? owned : { ...owned, 'share.slug': null }, {
            $set: { 'share.slug': slug },
          })
          .exec();
        if (res.matchedCount > 0) return slug;
        const current = await this.simulations.findOne(owned).select({ share: 1 }).lean().exec();
        if (current?.share?.slug) return current.share.slug;
        throw notFound('Simulation not found');
      } catch (error) {
        if ((error as { code?: number }).code !== DUPLICATE_KEY || attempt >= SLUG_ATTEMPTS) {
          throw error;
        }
      }
    }
  }
}
