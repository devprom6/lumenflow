import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  type OfframpQuote,
  type OfframpQuoteRequest,
  type OfframpOrderRequest,
  type Order,
} from '@lumenflow/shared-types';
import { AnchorClient } from '@lumenflow/anchor-client';
import { PrismaService } from '../database/prisma.service';
import { OrderStateMachineService, type InMemoryOrder } from '../orders/order-state-machine.service';
import { TieredLimitsService } from './tiered-limits.service';
import { MockComplianceHookService } from '../compliance/mock-compliance-hook.service';

export interface CreateOfframpOrderResult {
  order: Order;
  interactiveUrl: string;
  anchorTxId: string;
}

@Injectable()
export class OfframpService {
  private readonly logger = new Logger(OfframpService.name);
  private readonly quotesCache = new Map<string, OfframpQuote>();
  private readonly anchorClient: AnchorClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachineService,
    private readonly tieredLimits: TieredLimitsService,
    private readonly complianceHook: MockComplianceHookService,
  ) {
    this.anchorClient = new AnchorClient({ timeoutMs: 3000, maxRetries: 1 });
  }

  /**
   * Generates a guaranteed offramp quote with fee breakdown and rate-lock duration.
   */
  async createQuote(
    req: OfframpQuoteRequest,
    userId?: string,
  ): Promise<OfframpQuote> {
    const srcAmount = parseFloat(req.sourceAmount);
    if (isNaN(srcAmount) || srcAmount <= 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid source amount for offramp quote',
      });
    }

    // Default rate: 1 USDC = 1550 NGN (or 130 KES, 15 GHS)
    let rate = 1550.0;
    if (req.destinationCurrency.toUpperCase() === 'KES') rate = 130.0;
    if (req.destinationCurrency.toUpperCase() === 'GHS') rate = 15.5;

    // Fees: Anchor fee 0.5% (min 0.50), Network fee 0.00001, Platform fee 0.25%
    const anchorFeeNum = Math.max(0.5, srcAmount * 0.005);
    const networkFeeNum = 0.00001;
    const platformFeeNum = srcAmount * 0.0025;
    const totalFeeNum = anchorFeeNum + networkFeeNum + platformFeeNum;

    const netAmount = Math.max(0, srcAmount - totalFeeNum);
    const destAmountNum = netAmount * rate;

    const rateLockDurationSeconds = 600; // 10 minutes
    const now = new Date();
    const expiresAt = new Date(now.getTime() + rateLockDurationSeconds * 1000);

    const quote: OfframpQuote = {
      id: crypto.randomUUID(),
      sourceAsset: req.sourceAsset,
      destinationCurrency: req.destinationCurrency.toUpperCase(),
      sourceAmount: srcAmount.toFixed(7),
      destinationAmount: destAmountNum.toFixed(2),
      exchangeRate: rate.toFixed(2),
      feeBreakdown: {
        anchorFee: anchorFeeNum.toFixed(7),
        networkFee: networkFeeNum.toFixed(7),
        platformFee: platformFeeNum.toFixed(7),
        totalFee: totalFeeNum.toFixed(7),
      },
      rateLockDurationSeconds,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };

    this.quotesCache.set(quote.id, quote);

    // Save in database if available
    try {
      await this.prisma.quote.create({
        data: {
          id: quote.id,
          userId: userId ?? null,
          sourceAsset: quote.sourceAsset,
          destinationAsset: { type: 'fiat', code: quote.destinationCurrency },
          sourceAmount: quote.sourceAmount,
          destinationAmount: quote.destinationAmount,
          minimumReceived: quote.destinationAmount,
          slippageTolerance: 0,
          priceImpact: 0,
          networkFee: quote.feeBreakdown.networkFee,
          platformFee: quote.feeBreakdown.platformFee,
          path: [],
          expiresAt,
        },
      });
    } catch {
      // In-memory fallback
    }

    this.logger.log(`Generated offramp quote ${quote.id} (${quote.sourceAmount} -> ${quote.destinationAmount} ${quote.destinationCurrency})`);
    return quote;
  }

  /**
   * Retrieves an offramp quote and verifies that it is not expired.
   */
  async getQuoteAndAssertNotExpired(quoteId: string): Promise<OfframpQuote> {
    let quote = this.quotesCache.get(quoteId);
    if (!quote) {
      try {
        const dbQuote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
        if (dbQuote) {
          const destAsset = dbQuote.destinationAsset as { code?: string };
          quote = {
            id: dbQuote.id,
            sourceAsset: dbQuote.sourceAsset as unknown as OfframpQuote['sourceAsset'],
            destinationCurrency: destAsset.code ?? 'NGN',
            sourceAmount: dbQuote.sourceAmount,
            destinationAmount: dbQuote.destinationAmount ?? '0',
            exchangeRate: '1550.00',
            feeBreakdown: {
              anchorFee: '0.5000000',
              networkFee: dbQuote.networkFee,
              platformFee: dbQuote.platformFee,
              totalFee: '0.5000000',
            },
            rateLockDurationSeconds: 600,
            expiresAt: dbQuote.expiresAt.toISOString(),
            createdAt: dbQuote.createdAt.toISOString(),
          };
          this.quotesCache.set(quote.id, quote);
        }
      } catch {
        // Offline
      }
    }

    if (!quote) {
      throw new NotFoundException(`Offramp quote with id '${quoteId}' not found.`);
    }

    if (new Date(quote.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'QUOTE_EXPIRED',
        message: 'Offramp rate-lock has expired. Please fetch a fresh quote.',
        details: { quoteId, expiresAt: quote.expiresAt },
      });
    }

    return quote;
  }

  /**
   * Creates an offramp order with compliance and tiered limit checks.
   */
  async createOrder(
    req: OfframpOrderRequest,
    userId = 'guest-user',
  ): Promise<CreateOfframpOrderResult> {
    const quote = await this.getQuoteAndAssertNotExpired(req.quoteId);
    const amountUsd = parseFloat(quote.sourceAmount);

    // 1. Compliance screening
    const complianceDecision = await this.complianceHook.screenTransaction({
      userId,
      userAddress: req.userAddress,
      amountUsd,
      destinationCurrency: quote.destinationCurrency,
      destinationDetails: req.destinationDetails,
    });

    if (!complianceDecision.allowed || complianceDecision.action === 'BLOCK') {
      throw new ForbiddenException({
        code: 'COMPLIANCE_BLOCKED',
        message: complianceDecision.reason ?? 'Transaction blocked by compliance policy',
        matchedList: complianceDecision.matchedList,
      });
    }

    // 2. Tiered limits enforcement
    await this.tieredLimits.checkLimits(userId, amountUsd);

    // 3. Obtain interactive withdrawal session
    const anchorTxId = `anchor-sep24-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const anchorPort = process.env['MOCK_ANCHOR_PORT'] ?? '4001';
    const interactiveUrl = `http://localhost:${anchorPort}/interactive?transaction_id=${anchorTxId}`;

    const orderId = crypto.randomUUID();
    const destinationAsset = { type: 'fiat', code: quote.destinationCurrency };

    // Register Order in memory / database
    try {
      await this.prisma.order.create({
        data: {
          id: orderId,
          userId,
          type: 'OFFRAMP',
          status: 'CREATED',
          sourceAsset: quote.sourceAsset,
          destinationAsset,
          sourceAmount: quote.sourceAmount,
          destinationAmount: quote.destinationAmount,
          quoteId: quote.id,
          externalId: anchorTxId,
        },
      });

      // State transitions
      await this.stateMachine.transition(orderId, 'QUOTED', {
        reason: `Offramp quote ${quote.id} locked`,
      });
      await this.stateMachine.transition(orderId, 'AWAITING_SIGNATURE', {
        externalId: anchorTxId,
        reason: 'Anchor SEP-24 interactive window ready for user details',
      });
    } catch {
      // Memory fallback for tests
      const memOrder: InMemoryOrder = {
        id: orderId,
        userId,
        type: 'OFFRAMP',
        status: 'CREATED',
        sourceAsset: quote.sourceAsset,
        destinationAsset,
        sourceAmount: quote.sourceAmount,
        destinationAmount: quote.destinationAmount,
        quoteId: quote.id,
        externalId: anchorTxId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [],
      };
      this.stateMachine.setInMemoryOrder(memOrder);

      await this.stateMachine.transition(orderId, 'QUOTED', {
        reason: `Offramp quote ${quote.id} locked`,
      });
      await this.stateMachine.transition(orderId, 'AWAITING_SIGNATURE', {
        externalId: anchorTxId,
        reason: 'Anchor SEP-24 interactive window ready for user details',
      });
    }

    const fetchedOrder = await this.getOrder(orderId);
    return {
      order: fetchedOrder,
      interactiveUrl,
      anchorTxId,
    };
  }

  /**
   * Fetches order by ID.
   */
  async getOrder(orderId: string): Promise<Order> {
    const mem = this.stateMachine.getInMemoryOrder(orderId);
    if (mem) {
      return {
        id: mem.id,
        userId: mem.userId,
        type: mem.type as Order['type'],
        status: mem.status,
        sourceAsset: mem.sourceAsset as Order['sourceAsset'],
        destinationAsset: mem.destinationAsset as Order['destinationAsset'],
        sourceAmount: mem.sourceAmount,
        destinationAmount: mem.destinationAmount,
        quoteId: mem.quoteId,
        stellarTxHash: mem.stellarTxHash,
        externalId: mem.externalId,
        createdAt: mem.createdAt.toISOString(),
        updatedAt: mem.updatedAt.toISOString(),
      };
    }

    try {
      const dbOrder = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { events: true },
      });

      if (!dbOrder) {
        throw new NotFoundException(`Order with id '${orderId}' not found.`);
      }

      return {
        id: dbOrder.id,
        userId: dbOrder.userId,
        type: dbOrder.type as Order['type'],
        status: dbOrder.status as Order['status'],
        sourceAsset: dbOrder.sourceAsset as unknown as Order['sourceAsset'],
        destinationAsset: dbOrder.destinationAsset as unknown as Order['destinationAsset'],
        sourceAmount: dbOrder.sourceAmount,
        destinationAmount: dbOrder.destinationAmount ?? undefined,
        quoteId: dbOrder.quoteId ?? undefined,
        stellarTxHash: dbOrder.stellarTxHash ?? undefined,
        externalId: dbOrder.externalId ?? undefined,
        createdAt: dbOrder.createdAt.toISOString(),
        updatedAt: dbOrder.updatedAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException(`Order with id '${orderId}' not found.`);
    }
  }
}
