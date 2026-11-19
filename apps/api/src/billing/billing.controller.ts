import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  type BillingSyncRequest,
  type BillingUrlDto,
  type CheckoutRequest,
  billingSyncRequestSchema,
  checkoutRequestSchema,
} from '@futuria/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { BillingService } from './billing.service.js';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Start Stripe Checkout for Pro or Premium (monthly or yearly). */
  @Post('checkout')
  @HttpCode(200)
  checkout(
    @CurrentUser() auth: AuthContext,
    @Body({ schema: checkoutRequestSchema }) body: CheckoutRequest,
  ): Promise<BillingUrlDto> {
    return this.billing.checkout(auth, body);
  }

  /** Open the Stripe Customer Portal. */
  @Post('portal')
  @HttpCode(200)
  portal(@CurrentUser() auth: AuthContext): Promise<BillingUrlDto> {
    return this.billing.portal(auth);
  }

  /** Sync the plan right after Checkout (the webhook may not have arrived yet). */
  @Post('sync')
  @HttpCode(204)
  async sync(
    @CurrentUser() auth: AuthContext,
    @Body({ schema: billingSyncRequestSchema }) body: BillingSyncRequest,
  ): Promise<void> {
    await this.billing.syncCheckoutSession(auth, body.sessionId);
  }

  /** Stripe webhooks, verified with the endpoint's signing secret against the raw body. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.billing.handleWebhook(request.rawBody, signature);
    return { received: true };
  }
}
