import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { serve } from 'inngest/express';
import { Public } from '../auth/public.decorator.js';
import { InngestService } from './inngest.service.js';

/**
 * Inngest calls this endpoint to discover and run functions. It is public to our auth guard
 * because Inngest signs its requests (verified with INNGEST_SIGNING_KEY outside dev mode).
 */
@Public()
@Controller('api/inngest')
export class InngestController {
  private readonly handler: ReturnType<typeof serve>;

  constructor(inngest: InngestService) {
    this.handler = serve({ client: inngest.client, functions: inngest.functions });
  }

  @All()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handler(req, res);
  }
}
