import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrderStateMachineService } from '../../orders/order-state-machine.service';
import { TieredLimitsService } from '../tiered-limits.service';
import { MockComplianceHookService } from '../../compliance/mock-compliance-hook.service';
import { OfframpService } from '../offramp.service';

describe('OfframpService Integration', () => {
  let prisma: PrismaService;
  let stateMachine: OrderStateMachineService;
  let tieredLimits: TieredLimitsService;
  let complianceHook: MockComplianceHookService;
  let offrampService: OfframpService;

  beforeEach(() => {
    prisma = new PrismaService();
    stateMachine = new OrderStateMachineService(prisma);
    tieredLimits = new TieredLimitsService(prisma);
    complianceHook = new MockComplianceHookService();
    offrampService = new OfframpService(
      prisma,
      stateMachine,
      tieredLimits,
      complianceHook,
    );
  });

  const validSourceAsset = {
    type: 'credit_alphanum4' as const,
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  };

  it('creates an offramp quote with fee breakdown and rate lock', async () => {
    const quote = await offrampService.createQuote({
      sourceAsset: validSourceAsset,
      destinationCurrency: 'NGN',
      sourceAmount: '100.0000000',
    });

    expect(quote.id).toBeDefined();
    expect(quote.destinationCurrency).toBe('NGN');
    expect(quote.sourceAmount).toBe('100.0000000');
    expect(Number(quote.destinationAmount)).toBeGreaterThan(0);
    expect(quote.rateLockDurationSeconds).toBe(600);
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(quote.feeBreakdown.anchorFee).toBeDefined();
    expect(quote.feeBreakdown.networkFee).toBeDefined();
    expect(quote.feeBreakdown.platformFee).toBeDefined();
    expect(quote.feeBreakdown.totalFee).toBeDefined();
  });

  it('rejects order creation if rate lock has expired', async () => {
    const quote = await offrampService.createQuote({
      sourceAsset: validSourceAsset,
      destinationCurrency: 'NGN',
      sourceAmount: '50.0000000',
    });

    // Artificially expire quote
    quote.expiresAt = new Date(Date.now() - 1000).toISOString();

    await expect(
      offrampService.createOrder({
        quoteId: quote.id,
        userAddress: 'GAHK7WOJWVUUMF5254UOBK55P5Z57XF4MGH7R75KIZ5EZ5KIZ5EZ5KIZ',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates an offramp order and transitions state machine', async () => {
    const quote = await offrampService.createQuote({
      sourceAsset: validSourceAsset,
      destinationCurrency: 'NGN',
      sourceAmount: '75.0000000',
    });

    const result = await offrampService.createOrder({
      quoteId: quote.id,
      userAddress: 'GAHK7WOJWVUUMF5254UOBK55P5Z57XF4MGH7R75KIZ5EZ5KIZ5EZ5KIZ',
      destinationDetails: {
        bankName: 'Access Bank',
        accountNumber: '0123456789',
      },
    });

    expect(result.order.id).toBeDefined();
    expect(result.order.status).toBe('AWAITING_SIGNATURE');
    expect(result.order.type).toBe('OFFRAMP');
    expect(result.interactiveUrl).toContain('/interactive?transaction_id=');
    expect(result.anchorTxId).toBeDefined();

    // Verify order can be retrieved
    const fetched = await offrampService.getOrder(result.order.id);
    expect(fetched.id).toBe(result.order.id);
    expect(fetched.status).toBe('AWAITING_SIGNATURE');
  });

  it('enforces tiered limits on transaction amount', async () => {
    // User at Tier 1 has single transaction limit of $500
    const quote = await offrampService.createQuote({
      sourceAsset: validSourceAsset,
      destinationCurrency: 'NGN',
      sourceAmount: '600.0000000', // exceeds $500 limit
    });

    await expect(
      offrampService.createOrder(
        {
          quoteId: quote.id,
          userAddress: 'GAHK7WOJWVUUMF5254UOBK55P5Z57XF4MGH7R75KIZ5EZ5KIZ5EZ5KIZ',
        },
        'user-tier-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks order creation when user address is flagged by compliance hook', async () => {
    const quote = await offrampService.createQuote({
      sourceAsset: validSourceAsset,
      destinationCurrency: 'NGN',
      sourceAmount: '50.0000000',
    });

    // Sanctioned test address
    const sanctionedAddress = 'GBBLOCKEDSANCTIONEDADDRESSFORTESTINGPURPOSES000000000001';

    await expect(
      offrampService.createOrder({
        quoteId: quote.id,
        userAddress: sanctionedAddress,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
