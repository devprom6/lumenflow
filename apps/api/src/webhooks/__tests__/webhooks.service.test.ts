import { describe, it, expect, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { OrderStateMachineService, type InMemoryOrder } from '../../orders/order-state-machine.service';
import { WebhooksService } from '../webhooks.service';

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

  function signPayload(body: Record<string, unknown>): string {
    const hash = crypto
      .createHmac('sha256', SECRET)
      .update(JSON.stringify(body))
      .digest('hex');
    return `sha256=${hash}`;
  }

  function setupInMemoryOrder(orderId: string): InMemoryOrder {
    const order: InMemoryOrder = {
      id: orderId,
      userId: 'test-user',
      type: 'OFFRAMP',
      status: 'AWAITING_SIGNATURE',
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
});
