import {
  Controller,
  Post,
  Body,
  Headers,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WebhooksService } from './webhooks.service';
import {
  AnchorWebhookPayloadSchema,
  PayoutWebhookPayloadSchema,
  BridgeWebhookPayloadSchema,
  type AnchorWebhookPayload,
  type PayoutWebhookPayload,
  type BridgeWebhookPayload,
} from './dtos/webhook.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('bridge')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(BridgeWebhookPayloadSchema))
  @ApiOperation({ summary: 'Cross-chain Bridge provider transfer status callback' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'HMAC-SHA256 signature' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: 'Unix timestamp for replay defense', required: false })
  @ApiResponse({ status: 200, description: 'Bridge webhook processed idempotently' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature or replay window expired' })
  async bridgeCallback(
    @Body() payload: BridgeWebhookPayload,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-signature') altSignature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-timestamp') altTimestamp?: string,
  ) {
    const sig = signature ?? altSignature;
    const ts = timestamp ?? altTimestamp;
    return this.webhooksService.processBridgeWebhook(payload, sig, ts);
  }

  @Post('anchor')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(AnchorWebhookPayloadSchema))
  @ApiOperation({ summary: 'Stellar Anchor SEP-24 status callback' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'HMAC-SHA256 signature' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: 'Unix timestamp for replay defense', required: false })
  @ApiResponse({ status: 200, description: 'Webhook processed idempotently' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature or replay window expired' })
  async anchorCallback(
    @Body() payload: AnchorWebhookPayload,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-signature') altSignature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-timestamp') altTimestamp?: string,
  ) {
    const sig = signature ?? altSignature;
    const ts = timestamp ?? altTimestamp;
    return this.webhooksService.processAnchorWebhook(payload, sig, ts);
  }

  @Post('payout')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(PayoutWebhookPayloadSchema))
  @ApiOperation({ summary: 'Fiat Payout rail status callback' })
  @ApiHeader({ name: 'x-webhook-signature', description: 'HMAC-SHA256 signature' })
  @ApiHeader({ name: 'x-webhook-timestamp', description: 'Unix timestamp for replay defense', required: false })
  @ApiResponse({ status: 200, description: 'Webhook processed idempotently' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature or replay window expired' })
  async payoutCallback(
    @Body() payload: PayoutWebhookPayload,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-signature') altSignature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-timestamp') altTimestamp?: string,
  ) {
    const sig = signature ?? altSignature;
    const ts = timestamp ?? altTimestamp;
    return this.webhooksService.processPayoutWebhook(payload, sig, ts);
  }
}
