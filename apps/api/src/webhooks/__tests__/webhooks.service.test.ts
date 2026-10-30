import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { OrderStateMachineService, type InMemoryOrder } from '../../orders/order-state-machine.service';
import { WebhooksService } from '../webhooks.service';
import type { BridgeWebhookPayload } from '../dtos/webhook.dto';

describe('WebhooksService Integration', () => {
  let prisma: PrismaService;
  let stateMachine: OrderStateMachineService;
  let webhooksService: WebhooksService;
  const SECRET = process.env['WEBHOOK_SIGNING_SECRET'] ?? 'replace_me_with_a_strong_random_secret';

  beforeEach(() => {
    prisma = new PrismaService();
    stateMachine = new OrderStateMachineService(prisma);
    webhooksService = new WebhooksService(prisma, stateMachine);
  });

  function signPayload(body: Record<string, unknown>, secret = SECRET): string {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');
    return `sha256=${hash}`;
  }

  function setupInMemoryOrder(orderId: string, initialStatus = 'AWAITING_SIGNATURE'): InMemoryOrder {
    const order: InMemoryOrder = {
      id: orderId,
      userId: 'test-user',
      type: 'OFFRAMP',
      status: initialStatus as InMemoryOrder['status'],
      sourceAsset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      destinationAsset: { type: 'fiat', code: 'NGN' },
      sourceAmount: '100.0000000',
      destinationAmount: '154000.00',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    };
    stateMachine.setInMemoryOrder(order);
    return order;
  }

  describe('Signature & Timestamp Verification', () => {
    it('rejects webhooks with missing or invalid HMAC signature', async () => {
      const payload = {
        eventId: 'evt-1',
        orderId: '00000000-0000-0000-0000-000000000001',
        status: 'pending_anchor',
      };

      // Missing signature
      await expect(
        webhooksService.processAnchorWebhook(payload),
      ).rejects.toThrow(UnauthorizedException);

      // Invalid signature
      await expect(
        webhooksService.processAnchorWebhook(payload, 'sha256=invalidhash123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepts webhooks with valid timestamp within drift window', () => {
      const currentSeconds = Math.floor(Date.now() / 1000);
      expect(() =>
        webhooksService.assertValidTimestamp(currentSeconds.toString()),
      ).not.toThrow();
    });

    it('rejects webhooks when timestamp drift exceeds 300 seconds', () => {
      const oldSeconds = Math.floor(Date.now() / 1000) - 350;
      expect(() =>
        webhooksService.assertValidTimestamp(oldSeconds.toString()),
      ).toThrow(UnauthorizedException);
    });

    it('rejects malformed non-numeric timestamp headers', () => {
      expect(() =>
        webhooksService.assertValidTimestamp('not-a-number'),
      ).toThrow(UnauthorizedException);
    });

    it('enforces non-default signing secret in production mode', () => {
      const prevEnv = process.env['NODE_ENV'];
      const prevSecret = process.env['WEBHOOK_SIGNING_SECRET'];
      try {
        process.env['NODE_ENV'] = 'production';
        delete process.env['WEBHOOK_SIGNING_SECRET'];

        expect(() =>
          webhooksService.verifySignature('sha256=123', { test: true }),
        ).toThrow('WEBHOOK_SIGNING_SECRET must be securely set in production.');
      } finally {
        process.env['NODE_ENV'] = prevEnv;
        if (prevSecret) process.env['WEBHOOK_SIGNING_SECRET'] = prevSecret;
      }
    });
  });

  describe('Offramp Lifecycle & Status Transitions', () => {
    it('executes full offramp lifecycle via anchor and payout webhooks', async () => {
      const orderId = '11111111-1111-1111-1111-111111111111';
      const order = setupInMemoryOrder(orderId);
      expect(order.status).toBe('AWAITING_SIGNATURE');

      // 1. Anchor webhook: customer has signed Stellar transaction, anchor detected it
      const anchorPayload = {
        eventId: 'anchor-evt-1',
        orderId,
        status: 'pending_anchor',
        stellarTxHash: 'stellar-tx-hash-abc-123',
      };
      const anchorSig = signPayload(anchorPayload);

      const anchorRes = await webhooksService.processAnchorWebhook(anchorPayload, anchorSig);
      expect(anchorRes.received).toBe(true);
      expect(anchorRes.toStatus).toBe('PROCESSING');
      expect(order.status).toBe('PROCESSING');
      expect(order.stellarTxHash).toBe('stellar-tx-hash-abc-123');

      // 2. Payout webhook: fiat rail successfully delivered NGN to bank
      const payoutPayload = {
        eventId: 'payout-evt-1',
        orderId,
        status: 'SUCCESS' as const,
        externalReference: 'bank-ref-xyz-987',
      };
      const payoutSig = signPayload(payoutPayload);

      const payoutRes = await webhooksService.processPayoutWebhook(payoutPayload, payoutSig);
      expect(payoutRes.received).toBe(true);
      expect(payoutRes.toStatus).toBe('COMPLETED');
      expect(order.status).toBe('COMPLETED');

      // Verify audit trail in order_events ledger
      expect(order.events.length).toBeGreaterThanOrEqual(2);
      const finalEvent = order.events[order.events.length - 1];
      expect(finalEvent?.toStatus).toBe('COMPLETED');
    });

    it('handles anchor failure status by transitioning order to FAILED', async () => {
      const orderId = 'anchor-fail-1';
      const order = setupInMemoryOrder(orderId, 'SUBMITTED');

      const failPayload = {
        eventId: 'anchor-fail-evt',
        orderId,
        status: 'failed',
      };
      const res = await webhooksService.processAnchorWebhook(failPayload, signPayload(failPayload));
      expect(res.toStatus).toBe('FAILED');
      expect(order.status).toBe('FAILED');
    });

    it('handles anchor expired status by transitioning order to EXPIRED', async () => {
      const orderId = 'anchor-expire-1';
      const order = setupInMemoryOrder(orderId, 'AWAITING_SIGNATURE');

      const expirePayload = {
        eventId: 'anchor-exp-evt',
        orderId,
        status: 'expired',
      };
      const res = await webhooksService.processAnchorWebhook(expirePayload, signPayload(expirePayload));
      expect(res.toStatus).toBe('EXPIRED');
      expect(order.status).toBe('EXPIRED');
    });

    it('handles payout FAILED and REFUNDED transitions', async () => {
      const orderId = 'payout-fail-1';
      const order = setupInMemoryOrder(orderId, 'PROCESSING');

      const failPayload = {
        eventId: 'payout-fail-evt',
        orderId,
        status: 'FAILED' as const,
      };
      await webhooksService.processPayoutWebhook(failPayload, signPayload(failPayload));
      expect(order.status).toBe('FAILED');

      const refundPayload = {
        eventId: 'payout-refund-evt',
        orderId,
        status: 'REFUNDED' as const,
      };
      await webhooksService.processPayoutWebhook(refundPayload, signPayload(refundPayload));
      expect(order.status).toBe('REFUNDED');
    });

    it('handles payout PROCESSING status without changing already processing order', async () => {
      const orderId = 'payout-proc-1';
      const order = setupInMemoryOrder(orderId, 'PROCESSING');

      const procPayload = {
        eventId: 'payout-proc-evt',
        orderId,
        status: 'PENDING' as const,
      };
      const res = await webhooksService.processPayoutWebhook(procPayload, signPayload(procPayload));
      expect(res.received).toBe(true);
      expect(order.status).toBe('PROCESSING');
    });
  });

  describe('Cross-Chain Bridge Webhooks', () => {
    it('processes bridge transfer lifecycle from IN_FLIGHT to CONFIRMED', async () => {
      const orderId = 'bridge-webhook-order-1';
      const order = setupInMemoryOrder(orderId, 'AWAITING_SIGNATURE');
      order.type = 'BRIDGE';

      // 1. In flight
      const flightPayload: BridgeWebhookPayload = {
        eventId: 'evt-flight-1',
        transferId: 'bridge-tx-123',
        orderId,
        status: 'IN_FLIGHT',
        txHash: 'src_tx_999',
      };
      const resFlight = await webhooksService.processBridgeWebhook(flightPayload, signPayload(flightPayload));
      expect(resFlight.toStatus).toBe('PROCESSING');
      expect(order.status).toBe('PROCESSING');

      // 2. Confirmed on destination chain
      const confirmPayload: BridgeWebhookPayload = {
        eventId: 'evt-confirm-1',
        transferId: 'bridge-tx-123',
        orderId,
        status: 'COMPLETED',
        txHash: 'dest_tx_888',
      };
      const resConfirm = await webhooksService.processBridgeWebhook(confirmPayload, signPayload(confirmPayload));
      expect(resConfirm.toStatus).toBe('COMPLETED');
      expect(order.status).toBe('COMPLETED');
    });

    it('handles bridge FAILED and REFUNDED callbacks', async () => {
      const orderId = 'bridge-fail-order-1';
      const order = setupInMemoryOrder(orderId, 'PROCESSING');
      order.type = 'BRIDGE';

      const failPayload: BridgeWebhookPayload = {
        eventId: 'evt-bridge-fail',
        transferId: 'bridge-fail-tx',
        orderId,
        status: 'FAILED',
      };
      await webhooksService.processBridgeWebhook(failPayload, signPayload(failPayload));
      expect(order.status).toBe('FAILED');

      const refundPayload: BridgeWebhookPayload = {
        eventId: 'evt-bridge-refund',
        transferId: 'bridge-fail-tx',
        orderId,
        status: 'REFUNDED',
      };
      await webhooksService.processBridgeWebhook(refundPayload, signPayload(refundPayload));
      expect(order.status).toBe('REFUNDED');
    });

    it('ignores duplicate bridge webhooks idempotently', async () => {
      const orderId = 'bridge-dup-order-1';
      setupInMemoryOrder(orderId, 'PROCESSING');

      const payload: BridgeWebhookPayload = {
        eventId: 'evt-dup-bridge',
        transferId: 'tx-dup-1',
        orderId,
        status: 'IN_FLIGHT',
      };
      const sig = signPayload(payload);

      const res1 = await webhooksService.processBridgeWebhook(payload, sig);
      expect(res1.received).toBe(true);
      expect(res1.idempotent).toBeUndefined();

      const res2 = await webhooksService.processBridgeWebhook(payload, sig);
      expect(res2.received).toBe(true);
      expect(res2.idempotent).toBe(true);
    });
  });

  describe('Idempotency & Replay Protection', () => {
    it('handles duplicate webhook delivery idempotently without corrupting state', async () => {
      const orderId = '22222222-2222-2222-2222-222222222222';
      const order = setupInMemoryOrder(orderId);

      const payload = {
        eventId: 'anchor-duplicate-evt',
        orderId,
        status: 'pending_anchor',
      };
      const sig = signPayload(payload);

      // First delivery: processes
      const res1 = await webhooksService.processAnchorWebhook(payload, sig);
      expect(res1.received).toBe(true);
      expect(order.status).toBe('PROCESSING');
      const eventCountBefore = order.events.length;

      // Duplicate delivery: recognized as idempotent duplicate
      const res2 = await webhooksService.processAnchorWebhook(payload, sig);
      expect(res2.received).toBe(true);
      expect(res2.idempotent).toBe(true);
      // Order state unchanged, no duplicate events logged
      expect(order.status).toBe('PROCESSING');
      expect(order.events.length).toBe(eventCountBefore);
    });

    it('handles duplicate payout webhooks idempotently', async () => {
      const orderId = 'payout-dup-1';
      setupInMemoryOrder(orderId, 'PROCESSING');

      const payload = {
        eventId: 'payout-dup-evt',
        orderId,
        status: 'SUCCESS' as const,
      };
      const sig = signPayload(payload);

      const res1 = await webhooksService.processPayoutWebhook(payload, sig);
      expect(res1.toStatus).toBe('COMPLETED');

      const res2 = await webhooksService.processPayoutWebhook(payload, sig);
      expect(res2.idempotent).toBe(true);
    });

    it('handles out-of-order webhooks safely without throwing unhandled errors', async () => {
      const orderId = '33333333-3333-3333-3333-333333333333';
      const order = setupInMemoryOrder(orderId);

      // Step 1: Payout completes directly
      const payoutPayload = {
        eventId: 'payout-fast-1',
        orderId,
        status: 'SUCCESS' as const,
      };
      await webhooksService.processPayoutWebhook(payoutPayload, signPayload(payoutPayload));
      expect(order.status).toBe('COMPLETED');

      // Step 2: A delayed anchor webhook arrives with older status 'pending_anchor'
      const delayedAnchorPayload = {
        eventId: 'anchor-delayed-1',
        orderId,
        status: 'pending_anchor',
      };

      // Should not throw or crash or revert order back to PROCESSING
      const delayedRes = await webhooksService.processAnchorWebhook(
        delayedAnchorPayload,
        signPayload(delayedAnchorPayload),
      );
      expect(delayedRes.received).toBe(true);
      expect(order.status).toBe('COMPLETED'); // Remains COMPLETED
    });

    it('resolves order by transferId when orderId is omitted in bridge webhook', async () => {
      const orderId = 'bridge-resolved-by-ext-id';
      const order = setupInMemoryOrder(orderId, 'PROCESSING');
      order.externalId = 'ext-bridge-unique-123';

      const payload: BridgeWebhookPayload = {
        eventId: 'evt-resolve-ext',
        transferId: 'ext-bridge-unique-123',
        status: 'COMPLETED',
        txHash: 'dest_hash_abc',
      };
      const res = await webhooksService.processBridgeWebhook(payload, signPayload(payload));
      expect(res.received).toBe(true);
      expect(order.status).toBe('COMPLETED');
    });

    it('handles bridge webhook with unknown transferId gracefully', async () => {
      const payload: BridgeWebhookPayload = {
        eventId: 'evt-unknown-transfer',
        transferId: 'unknown-transfer-xyz',
        status: 'IN_FLIGHT',
      };
      const res = await webhooksService.processBridgeWebhook(payload, signPayload(payload));
      expect(res.received).toBe(true);
      expect(res.message).toContain('recorded without matched order');
    });

    it('queries database for webhook duplicate check and records event if prisma is active', async () => {
      const findUniqueMock = vi.fn().mockResolvedValue({ processed: true });
      const mockPrisma = {
        webhookEvent: {
          findUnique: findUniqueMock,
          create: vi.fn().mockResolvedValue({}),
        },
        order: {
          findUnique: vi.fn().mockResolvedValue({ id: 'db-order-9', status: 'PROCESSING' }),
        },
      } as unknown as PrismaService;

      const dbStateMachine = new OrderStateMachineService(mockPrisma);
      const dbWebhooks = new WebhooksService(mockPrisma, dbStateMachine);

      const payload = {
        eventId: 'db-evt-check',
        orderId: 'db-order-9',
        status: 'pending_anchor',
      };
      const sig = signPayload(payload);

      const res = await dbWebhooks.processAnchorWebhook(payload, sig);
      expect(res.idempotent).toBe(true);
      expect(findUniqueMock).toHaveBeenCalled();
    });
  });
});
