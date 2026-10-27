import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { BridgeSafeguardsService } from '../bridge-safeguards.service';
import { BridgeService } from '../bridge.service';
import { OrderStateMachineService } from '../../orders/order-state-machine.service';
import { WebhooksService } from '../../webhooks/webhooks.service';
import type { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  quote: {
    create: () => Promise.resolve({ id: 'mock-quote-id' }),
    findUnique: () => Promise.resolve(null),
  },
  order: {
    create: () => Promise.resolve({ id: 'mock-order-id' }),
    findUnique: () => Promise.resolve(null),
    findFirst: () => Promise.resolve(null),
  },
  webhookEvent: {
    findUnique: () => Promise.resolve(null),
    create: () => Promise.resolve({ id: 'mock-webhook-event' }),
  },
} as unknown as PrismaService;

function createHmacSignature(payload: Record<string, unknown>, secret = 'test-secret'): string {
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('BridgeSafeguardsService', () => {
  let safeguards: BridgeSafeguardsService;

  beforeEach(() => {
    safeguards = new BridgeSafeguardsService();
  });

  it('allows quotes and transfers when kill switches are off', () => {
    expect(() =>
      safeguards.assertSafeguards('stellar-eth-usdc', 'MockBridge', '50'),
    ).not.toThrow();
  });

  it('blocks transfer when route is killed', () => {
    safeguards.setRouteKillSwitch('stellar-eth-usdc', true);
    expect(safeguards.isRouteKilled('stellar-eth-usdc')).toBe(true);
    expect(() =>
      safeguards.assertSafeguards('stellar-eth-usdc', 'MockBridge', '50'),
    ).toThrow(ForbiddenException);
  });

  it('blocks transfer when provider is killed', () => {
    safeguards.setProviderKillSwitch('MockBridge', true);
    expect(safeguards.isProviderKilled('MockBridge')).toBe(true);
    expect(() =>
      safeguards.assertSafeguards('stellar-eth-usdc', 'MockBridge', '50'),
    ).toThrow(ForbiddenException);
  });

  it('enforces min and max route limits', () => {
    safeguards.setRouteLimit('stellar-eth-usdc', {
      minAmount: '20',
      maxAmount: '500',
    });

    expect(() =>
      safeguards.assertSafeguards('stellar-eth-usdc', 'MockBridge', '10'),
    ).toThrow(BadRequestException);

    expect(() =>
      safeguards.assertSafeguards('stellar-eth-usdc', 'MockBridge', '1000'),
    ).toThrow(BadRequestException);

    expect(() =>
      safeguards.assertSafeguards('stellar-eth-usdc', 'MockBridge', '100'),
    ).not.toThrow();
  });
});

describe('BridgeService & Flow Integration', () => {
  let bridgeService: BridgeService;
  let stateMachine: OrderStateMachineService;
  let safeguards: BridgeSafeguardsService;
  let webhooksService: WebhooksService;

  beforeEach(() => {
    process.env['WEBHOOK_SIGNING_SECRET'] = 'test-secret';
    stateMachine = new OrderStateMachineService(mockPrisma);
    safeguards = new BridgeSafeguardsService();
    bridgeService = new BridgeService(mockPrisma, stateMachine, safeguards);
    webhooksService = new WebhooksService(mockPrisma, stateMachine);
  });

  it('discovers supported routes and filters killed routes', async () => {
    const routesInitial = await bridgeService.getSupportedRoutes();
    expect(routesInitial.length).toBeGreaterThan(0);

    safeguards.setRouteKillSwitch('stellar-eth-usdc', true);
    const routesAfter = await bridgeService.getSupportedRoutes();
    expect(routesAfter.some((r) => r.id === 'stellar-eth-usdc')).toBe(false);
  });

  it('generates a quote and initiates an unsigned bridge transfer', async () => {
    const quote = await bridgeService.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '100',
    });

    expect(quote.id).toBeDefined();
    expect(quote.fromAmount).toBe('100');
    expect(quote.toAmount).toBe('99.7500');

    const result = await bridgeService.initiateTransfer({
      quoteId: quote.id,
      sender: 'GBRIDGESENDERTESTNET1111111111111111111111111111111111111',
    });

    expect(result.order.status).toBe('AWAITING_SIGNATURE');
    expect(result.order.type).toBe('BRIDGE');
    expect(result.transfer.transferId).toBeDefined();
    expect(result.transfer.unsignedTransaction).toBeDefined();
    expect(result.transfer.depositAddress).toBeDefined();
    expect(result.transfer.memo).toMatch(/^LF-BR-/);

    // Verify order events were recorded
    const memOrder = stateMachine.getInMemoryOrder(result.order.id);
    expect(memOrder?.events.length).toBe(2); // CREATED->QUOTED, QUOTED->AWAITING_SIGNATURE
  });

  it('handles bridge webhooks with signature verification, idempotency, and state progression', async () => {
    const quote = await bridgeService.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '50',
    });

    const { order, transfer } = await bridgeService.initiateTransfer({
      quoteId: quote.id,
      sender: 'GBRIDGESENDERTESTNET1111111111111111111111111111111111111',
    });

    // 1. Signature check failure
    const badPayload = {
      eventId: 'evt-bad-sig',
      transferId: transfer.transferId,
      orderId: order.id,
      provider: 'MockBridge',
      status: 'IN_FLIGHT' as const,
    };
    await expect(
      webhooksService.processBridgeWebhook(badPayload, 'invalid_sig'),
    ).rejects.toThrow(UnauthorizedException);

    // 2. IN_FLIGHT webhook -> transitions AWAITING_SIGNATURE -> SUBMITTED -> PROCESSING
    const inFlightPayload = {
      eventId: 'evt-bridge-flight-1',
      transferId: transfer.transferId,
      orderId: order.id,
      provider: 'MockBridge',
      status: 'IN_FLIGHT' as const,
      txHash: '0x123abc',
    };
    const sig1 = createHmacSignature(inFlightPayload);
    const res1 = await webhooksService.processBridgeWebhook(inFlightPayload, sig1);
    expect(res1.toStatus).toBe('PROCESSING');

    // 3. Duplicate delivery is idempotent
    const resDup = await webhooksService.processBridgeWebhook(inFlightPayload, sig1);
    expect(resDup.idempotent).toBe(true);

    // 4. COMPLETED webhook -> transitions PROCESSING -> COMPLETED
    const completedPayload = {
      eventId: 'evt-bridge-comp-1',
      transferId: transfer.transferId,
      orderId: order.id,
      provider: 'MockBridge',
      status: 'COMPLETED' as const,
      txHash: '0x456def',
    };
    const sig2 = createHmacSignature(completedPayload);
    const res2 = await webhooksService.processBridgeWebhook(completedPayload, sig2);
    expect(res2.toStatus).toBe('COMPLETED');

    // 5. Out-of-order webhook after completion does not corrupt state
    const outOfOrderPayload = {
      eventId: 'evt-bridge-late-pending',
      transferId: transfer.transferId,
      orderId: order.id,
      provider: 'MockBridge',
      status: 'PENDING' as const,
    };
    const sigLate = createHmacSignature(outOfOrderPayload);
    const resLate = await webhooksService.processBridgeWebhook(outOfOrderPayload, sigLate);
    expect(resLate.received).toBe(true);
    expect(resLate.toStatus).toBe('COMPLETED');
  });
});
