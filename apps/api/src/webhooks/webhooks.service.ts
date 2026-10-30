import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { type OrderStatus } from '@lumenflow/shared-types';
import { PrismaService } from '../database/prisma.service';
import { OrderStateMachineService } from '../orders/order-state-machine.service';
import {
  type AnchorWebhookPayload,
  type PayoutWebhookPayload,
  type BridgeWebhookPayload,
} from './dtos/webhook.dto';

export interface WebhookProcessingResult {
  received: boolean;
  idempotent?: boolean | undefined;
  orderId: string;
  fromStatus?: string | undefined;
  toStatus?: string | undefined;
  message?: string | undefined;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly processedEvents = new Map<string, boolean>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachineService,
  ) {}

  /**
   * Verifies the HMAC-SHA256 signature against WEBHOOK_SIGNING_SECRET.
   */
  verifySignature(
    signatureHeader: string | undefined,
    rawBody: string | Record<string, unknown>,
  ): boolean {
    const defaultSecret = 'replace_me_with_a_strong_random_secret';
    const secret = process.env['WEBHOOK_SIGNING_SECRET'] ?? defaultSecret;

    if (process.env['NODE_ENV'] === 'production' && secret === defaultSecret) {
      this.logger.error('CRITICAL: Default WEBHOOK_SIGNING_SECRET used in production!');
      throw new Error('WEBHOOK_SIGNING_SECRET must be securely set in production.');
    }

    if (!signatureHeader) {
      return false;
    }

    const expectedSignature = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice('sha256='.length)
      : signatureHeader;

    const payloadString =
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    const computed = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Validates webhook timestamp against clock drift to mitigate replay attacks.
   */
  assertValidTimestamp(timestampHeader?: string, maxDriftSeconds = 300): void {
    if (!timestampHeader) return; // Optional header depending on provider specs
    const ts = parseInt(timestampHeader, 10);
    if (isNaN(ts)) {
      throw new UnauthorizedException('Invalid webhook timestamp header');
    }
    // Handle both second and millisecond timestamps
    const timestampMs = ts > 100000000000 ? ts : ts * 1000;
    const now = Date.now();
    const diffSeconds = Math.abs(now - timestampMs) / 1000;
    if (diffSeconds > maxDriftSeconds) {
      this.logger.warn(`Webhook timestamp drifted by ${diffSeconds}s (max allowed: ${maxDriftSeconds}s)`);
      throw new UnauthorizedException('Webhook timestamp expired or drifted beyond acceptable window');
    }
  }

  /**
   * Asserts signature is valid, throwing UnauthorizedException if not.
   */
  assertValidSignature(
    signatureHeader: string | undefined,
    body: Record<string, unknown>,
    timestampHeader?: string,
  ): void {
    this.assertValidTimestamp(timestampHeader);
    if (!this.verifySignature(signatureHeader, body)) {
      this.logger.warn(`Invalid or missing webhook signature: ${signatureHeader}`);
      throw new UnauthorizedException('Invalid or missing webhook signature');
    }
  }

  /**
   * Checks if webhook has already been processed (idempotency check).
   */
  private async isDuplicate(provider: string, eventId: string): Promise<boolean> {
    const key = `${provider}:${eventId}`;
    if (this.processedEvents.get(key)) {
      return true;
    }

    try {
      const existing = await this.prisma.webhookEvent.findUnique({
        where: {
          provider_eventId: {
            provider,
            eventId,
          },
        },
      });
      if (existing && existing.processed) {
        this.processedEvents.set(key, true);
        return true;
      }
    } catch {
      // In-memory fallback
    }

    return false;
  }

  /**
   * Records processed webhook event for idempotency tracking.
   */
  private async recordWebhookEvent(
    provider: string,
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const key = `${provider}:${eventId}`;
    this.processedEvents.set(key, true);

    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider,
          eventId,
          eventType,
          payload: payload as unknown as Prisma.InputJsonValue,
          processed: true,
          processedAt: new Date(),
        },
      });
    } catch {
      // In-memory fallback
    }
  }

  /**
   * Retrieves current order status from memory or database.
   */
  private async getCurrentOrderStatus(orderId: string): Promise<OrderStatus> {
    const mem = this.stateMachine.getInMemoryOrder(orderId);
    if (mem) {
      return mem.status;
    }

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
      if (!order) {
        throw new NotFoundException(`Order with id '${orderId}' not found.`);
      }
      return order.status as OrderStatus;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException(`Order with id '${orderId}' not found.`);
    }
  }

  /**
   * Processes SEP-24 Anchor callbacks.
   */
  async processAnchorWebhook(
    payload: AnchorWebhookPayload,
    signatureHeader?: string,
    timestampHeader?: string,
  ): Promise<WebhookProcessingResult> {
    this.assertValidSignature(signatureHeader, payload, timestampHeader);

    // Idempotency check
    if (await this.isDuplicate('anchor', payload.eventId)) {
      this.logger.log(`Duplicate anchor webhook ignored: event ${payload.eventId}`);
      return {
        received: true,
        idempotent: true,
        orderId: payload.orderId,
        message: 'Duplicate webhook already processed',
      };
    }

    const currentStatus = await this.getCurrentOrderStatus(payload.orderId);
    let targetStatus: OrderStatus | null = null;
    const anchorStatus = payload.status.toLowerCase();

    if (
      anchorStatus === 'pending_anchor' ||
      anchorStatus === 'pending_stellar' ||
      anchorStatus === 'pending_external' ||
      anchorStatus === 'pending_user_transfer_complete'
    ) {
      targetStatus = 'PROCESSING';
    } else if (anchorStatus === 'completed') {
      targetStatus = 'COMPLETED';
    } else if (anchorStatus === 'failed' || anchorStatus === 'error') {
      targetStatus = 'FAILED';
    } else if (anchorStatus === 'expired') {
      targetStatus = 'EXPIRED';
    }

    if (!targetStatus) {
      await this.recordWebhookEvent(
        'anchor',
        payload.eventId,
        payload.status,
        payload,
      );
      return {
        received: true,
        orderId: payload.orderId,
        fromStatus: currentStatus,
        message: `Anchor status '${payload.status}' recorded without order transition`,
      };
    }

    // Handle out-of-order transitions safely
    try {
      if (currentStatus === targetStatus) {
        // Already at target status
      } else if (targetStatus === 'PROCESSING') {
        if (currentStatus === 'AWAITING_SIGNATURE') {
          await this.stateMachine.transition(payload.orderId, 'SUBMITTED', {
            stellarTxHash: payload.stellarTxHash,
            reason: `Anchor confirmed deposit receipt (${payload.status})`,
          });
          await this.stateMachine.transition(payload.orderId, 'PROCESSING', {
            reason: 'Anchor processing offramp payment to bank',
          });
        } else if (currentStatus === 'SUBMITTED') {
          await this.stateMachine.transition(payload.orderId, 'PROCESSING', {
            reason: 'Anchor processing offramp payment to bank',
          });
        }
      } else if (targetStatus === 'COMPLETED') {
        if (currentStatus === 'AWAITING_SIGNATURE') {
          await this.stateMachine.transition(payload.orderId, 'SUBMITTED', {
            stellarTxHash: payload.stellarTxHash,
          });
          await this.stateMachine.transition(payload.orderId, 'PROCESSING');
          await this.stateMachine.transition(payload.orderId, 'COMPLETED', {
            reason: 'Anchor delivered fiat payout to customer bank account',
          });
        } else if (currentStatus === 'SUBMITTED') {
          await this.stateMachine.transition(payload.orderId, 'PROCESSING');
          await this.stateMachine.transition(payload.orderId, 'COMPLETED', {
            reason: 'Anchor delivered fiat payout to customer bank account',
          });
        } else if (currentStatus === 'PROCESSING') {
          await this.stateMachine.transition(payload.orderId, 'COMPLETED', {
            reason: 'Anchor delivered fiat payout to customer bank account',
          });
        }
      } else if (targetStatus === 'FAILED') {
        if (currentStatus !== 'COMPLETED' && currentStatus !== 'FAILED') {
          await this.stateMachine.transition(payload.orderId, 'FAILED', {
            reason: `Anchor reported failure: ${payload.status}`,
          });
        }
      } else if (targetStatus === 'EXPIRED') {
        if (currentStatus === 'AWAITING_SIGNATURE' || currentStatus === 'CREATED' || currentStatus === 'QUOTED') {
          await this.stateMachine.transition(payload.orderId, 'EXPIRED', {
            reason: 'Anchor transaction expired',
          });
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Out-of-order anchor webhook handled safely: ${String(err)}`);
    }

    await this.recordWebhookEvent(
      'anchor',
      payload.eventId,
      payload.status,
      payload,
    );

    const updatedStatus = await this.getCurrentOrderStatus(payload.orderId);
    return {
      received: true,
      orderId: payload.orderId,
      fromStatus: currentStatus,
      toStatus: updatedStatus,
    };
  }

  /**
   * Processes Payout Rail callbacks.
   */
  async processPayoutWebhook(
    payload: PayoutWebhookPayload,
    signatureHeader?: string,
    timestampHeader?: string,
  ): Promise<WebhookProcessingResult> {
    this.assertValidSignature(signatureHeader, payload, timestampHeader);

    // Idempotency check
    if (await this.isDuplicate('payout', payload.eventId)) {
      this.logger.log(`Duplicate payout webhook ignored: event ${payload.eventId}`);
      return {
        received: true,
        idempotent: true,
        orderId: payload.orderId,
        message: 'Duplicate webhook already processed',
      };
    }

    const currentStatus = await this.getCurrentOrderStatus(payload.orderId);

    try {
      if (payload.status === 'SUCCESS') {
        if (currentStatus === 'AWAITING_SIGNATURE') {
          await this.stateMachine.transition(payload.orderId, 'SUBMITTED');
          await this.stateMachine.transition(payload.orderId, 'PROCESSING');
          await this.stateMachine.transition(payload.orderId, 'COMPLETED', {
            reason: 'Payout provider confirmed bank transfer completed',
          });
        } else if (currentStatus === 'SUBMITTED') {
          await this.stateMachine.transition(payload.orderId, 'PROCESSING');
          await this.stateMachine.transition(payload.orderId, 'COMPLETED', {
            reason: 'Payout provider confirmed bank transfer completed',
          });
        } else if (currentStatus === 'PROCESSING') {
          await this.stateMachine.transition(payload.orderId, 'COMPLETED', {
            reason: 'Payout provider confirmed bank transfer completed',
          });
        }
      } else if (payload.status === 'FAILED') {
        if (currentStatus !== 'COMPLETED' && currentStatus !== 'FAILED') {
          await this.stateMachine.transition(payload.orderId, 'FAILED', {
            reason: 'Payout rail reported transfer failure',
          });
        }
      } else if (payload.status === 'REFUNDED') {
        if (currentStatus === 'PROCESSING' || currentStatus === 'FAILED') {
          await this.stateMachine.transition(payload.orderId, 'REFUNDED', {
            reason: 'Payout refund confirmed by rail',
          });
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Out-of-order payout webhook handled safely: ${String(err)}`);
    }

    await this.recordWebhookEvent(
      'payout',
      payload.eventId,
      payload.status,
      payload,
    );

    const updatedStatus = await this.getCurrentOrderStatus(payload.orderId);
    return {
      received: true,
      orderId: payload.orderId,
      fromStatus: currentStatus,
      toStatus: updatedStatus,
    };
  }

  /**
   * Processes Cross-Chain Bridge callbacks.
   */
  async processBridgeWebhook(
    payload: BridgeWebhookPayload,
    signatureHeader?: string,
    timestampHeader?: string,
  ): Promise<WebhookProcessingResult> {
    this.assertValidSignature(signatureHeader, payload, timestampHeader);

    const eventId = payload.eventId ?? `bridge-${payload.transferId}-${payload.status}`;

    // Idempotency check
    if (await this.isDuplicate('bridge', eventId)) {
      this.logger.log(`Duplicate bridge webhook ignored: event ${eventId}`);
      return {
        received: true,
        idempotent: true,
        orderId: payload.orderId ?? payload.transferId,
        message: 'Duplicate bridge webhook already processed',
      };
    }

    // Resolve orderId by payload.orderId or externalId (transferId)
    let orderId = payload.orderId;
    if (!orderId) {
      // Find order by externalId
      const memOrders = (this.stateMachine as unknown as { inMemoryOrders?: Map<string, { id: string; externalId?: string }> }).inMemoryOrders;
      if (memOrders) {
        for (const o of memOrders.values()) {
          if (o.externalId === payload.transferId) {
            orderId = o.id;
            break;
          }
        }
      }

      if (!orderId) {
        try {
          const dbOrder = await this.prisma.order.findFirst({
            where: { externalId: payload.transferId },
          });
          if (dbOrder) {
            orderId = dbOrder.id;
          }
        } catch {
          // DB offline
        }
      }
    }

    if (!orderId) {
      this.logger.warn(`No order found for bridge transferId ${payload.transferId}`);
      await this.recordWebhookEvent('bridge', eventId, payload.status, payload);
      return {
        received: true,
        orderId: payload.transferId,
        message: `Bridge transfer ${payload.transferId} status recorded without matched order`,
      };
    }

    const currentStatus = await this.getCurrentOrderStatus(orderId);

    try {
      if (payload.status === 'PENDING') {
        if (currentStatus === 'AWAITING_SIGNATURE') {
          await this.stateMachine.transition(orderId, 'SUBMITTED', {
            stellarTxHash: payload.txHash,
            reason: 'Bridge deposit observed on source chain',
          });
        }
      } else if (payload.status === 'IN_FLIGHT') {
        if (currentStatus === 'AWAITING_SIGNATURE') {
          await this.stateMachine.transition(orderId, 'SUBMITTED', {
            stellarTxHash: payload.txHash,
          });
          await this.stateMachine.transition(orderId, 'PROCESSING', {
            reason: 'Bridge transfer in flight across chains',
          });
        } else if (currentStatus === 'SUBMITTED') {
          await this.stateMachine.transition(orderId, 'PROCESSING', {
            reason: 'Bridge transfer in flight across chains',
          });
        }
      } else if (payload.status === 'COMPLETED') {
        if (currentStatus === 'AWAITING_SIGNATURE') {
          await this.stateMachine.transition(orderId, 'SUBMITTED', { stellarTxHash: payload.txHash });
          await this.stateMachine.transition(orderId, 'PROCESSING');
          await this.stateMachine.transition(orderId, 'COMPLETED', {
            reason: `Bridge transfer settled on destination chain (${payload.txHash ?? 'confirmed'})`,
          });
        } else if (currentStatus === 'SUBMITTED') {
          await this.stateMachine.transition(orderId, 'PROCESSING');
          await this.stateMachine.transition(orderId, 'COMPLETED', {
            reason: `Bridge transfer settled on destination chain (${payload.txHash ?? 'confirmed'})`,
          });
        } else if (currentStatus === 'PROCESSING') {
          await this.stateMachine.transition(orderId, 'COMPLETED', {
            reason: `Bridge transfer settled on destination chain (${payload.txHash ?? 'confirmed'})`,
          });
        }
      } else if (payload.status === 'FAILED' || payload.status === 'STUCK') {
        if (currentStatus !== 'COMPLETED' && currentStatus !== 'FAILED') {
          await this.stateMachine.transition(orderId, 'FAILED', {
            reason: payload.message ?? `Bridge transfer ${payload.status.toLowerCase()}`,
          });
        }
      } else if (payload.status === 'REFUNDED') {
        if (currentStatus === 'PROCESSING' || currentStatus === 'FAILED') {
          await this.stateMachine.transition(orderId, 'REFUNDED', {
            reason: payload.message ?? 'Bridge transfer refunded',
          });
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Out-of-order bridge webhook handled safely: ${String(err)}`);
    }

    await this.recordWebhookEvent('bridge', eventId, payload.status, payload);

    const updatedStatus = await this.getCurrentOrderStatus(orderId);
    return {
      received: true,
      orderId,
      fromStatus: currentStatus,
      toStatus: updatedStatus,
    };
  }
}
