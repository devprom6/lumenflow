import {
  Controller,
  Post,
  Body,
  Headers,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WebhooksService } from './webhooks.service';
import {
  AnchorWebhookPayloadSchema,
  PayoutWebhookPayloadSchema,
  type AnchorWebhookPayload,
  type PayoutWebhookPayload,
} from './dtos/webhook.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('anchor')
  @UsePipes(new ZodValidationPipe(AnchorWebhookPayloadSchema))
  @ApiOperation({ summary: 'Stellar Anchor SEP-24 status callback' })
  @ApiResponse({ status: 200, description: 'Webhook processed idempotently' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature' })
  async anchorCallback(
    @Body() payload: AnchorWebhookPayload,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-signature') altSignature?: string,
  ) {
    const sig = signature ?? altSignature;
    return this.webhooksService.processAnchorWebhook(payload, sig);
  }

  @Post('payout')
  @UsePipes(new ZodValidationPipe(PayoutWebhookPayloadSchema))
  @ApiOperation({ summary: 'Fiat Payout rail status callback' })
  @ApiResponse({ status: 200, description: 'Webhook processed idempotently' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature' })
  async payoutCallback(
    @Body() payload: PayoutWebhookPayload,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-signature') altSignature?: string,
  ) {
    const sig = signature ?? altSignature;
    return this.webhooksService.processPayoutWebhook(payload, sig);
  }
}
