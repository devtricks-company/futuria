import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import {
  type ShareRequest,
  type ShareSettingsDto,
  type ShareViewDto,
  objectIdSchema,
  shareRequestSchema,
  shareSlugSchema,
} from '@futuria/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ShareService } from './share.service.js';

@Controller()
export class ShareController {
  constructor(private readonly share: ShareService) {}

  /** Share settings of one's own simulation (needs an account). Returns the new settings. */
  @Post('simulations/:id/share')
  @HttpCode(200)
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id', { schema: objectIdSchema }) id: string,
    @Body({ schema: shareRequestSchema }) body: ShareRequest,
  ): Promise<ShareSettingsDto> {
    return this.share.update(auth, id, body);
  }

  /** A shared simulation, for anyone with the link. Not cached: un-sharing is immediate. */
  @Public()
  @Get('share/:slug')
  @Header('Cache-Control', 'no-store')
  view(@Param('slug', { schema: shareSlugSchema }) slug: string): Promise<ShareViewDto> {
    return this.share.getPublic(slug);
  }
}
