import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  DEFAULT_KYC_TIER_LIMITS,
  type KycAdapter,
  type KycTier,
  type KycTierLimit,
} from '@lumenflow/shared-types';
import { MockKycAdapter, HttpKycAdapter } from '@lumenflow/anchor-client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TieredLimitsService {
  private readonly logger = new Logger(TieredLimitsService.name);
  private readonly limits: Record<KycTier, KycTierLimit> = {
    ...DEFAULT_KYC_TIER_LIMITS,
  };
  private readonly kycAdapter: KycAdapter;

  constructor(private readonly prisma: PrismaService) {
    // Use real HTTP KYC adapter if env vars are configured
    const kycApiUrl = process.env['KYC_PROVIDER_API_URL'];
    const kycApiKey = process.env['KYC_PROVIDER_API_KEY'];

    if (kycApiUrl && kycApiKey) {
      this.kycAdapter = new HttpKycAdapter({
        name: process.env['KYC_PROVIDER_NAME'] ?? 'HttpKyc',
        apiUrl: kycApiUrl,
        apiKey: kycApiKey,
        // Only pass optional fields when they have actual values
        ...(process.env['KYC_PROVIDER_PARTNER_ID'] ? { partnerId: process.env['KYC_PROVIDER_PARTNER_ID'] } : {}),
        ...(process.env['KYC_PROVIDER_CALLBACK_URL'] ? { callbackUrl: process.env['KYC_PROVIDER_CALLBACK_URL'] } : {}),
        defaultTier: 1,
      });
      this.logger.log(`HttpKycAdapter registered for provider '${process.env['KYC_PROVIDER_NAME'] ?? 'HttpKyc'}'`);
    } else {
      this.kycAdapter = new MockKycAdapter({ defaultTier: 1 });
      this.logger.warn('KYC_PROVIDER_API_URL/KEY not set — using MockKycAdapter');
    }
  }

  getKycAdapter(): KycAdapter {
    return this.kycAdapter;
  }

  setTierLimit(tier: KycTier, limit: Partial<KycTierLimit>): void {
    const existing = this.limits[tier];
    this.limits[tier] = {
      ...existing,
      ...limit,
    };
  }

  getTierLimit(tier: KycTier): KycTierLimit {
    return this.limits[tier];
  }

  async checkLimits(
    userId: string,
    amountUsd: number,
    explicitTier?: KycTier,
  ): Promise<void> {
    const customer = await this.kycAdapter.getCustomerStatus(userId);
    const tier = explicitTier ?? customer.tier;
    const limit = this.limits[tier];

    // 1. Single transaction limit check
    if (amountUsd > limit.maxSingleTransactionUsd) {
      throw new BadRequestException({
        code: 'TIER_LIMIT_EXCEEDED',
        message: `Transaction amount $${amountUsd} exceeds KYC Tier ${tier} single transaction limit of $${limit.maxSingleTransactionUsd}. Please upgrade your KYC tier to continue.`,
        details: {
          currentTier: tier,
          maxSingleTransactionUsd: limit.maxSingleTransactionUsd,
          requestedAmountUsd: amountUsd,
        },
      });
    }

    // 2. 24-hour daily cumulative limit check
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let past24hVolume = 0;

    try {
      const pastOrders = await this.prisma.order.findMany({
        where: {
          userId,
          createdAt: { gte: since24h },
          status: { notIn: ['FAILED', 'EXPIRED', 'REFUNDED'] },
        },
      });

      for (const order of pastOrders) {
        past24hVolume += parseFloat(order.sourceAmount);
      }
    } catch {
      // If DB is offline, continue without past DB volume
    }

    if (past24hVolume + amountUsd > limit.maxDailyTransactionUsd) {
      throw new BadRequestException({
        code: 'DAILY_LIMIT_EXCEEDED',
        message: `Transaction would exceed your KYC Tier ${tier} 24-hour limit of $${limit.maxDailyTransactionUsd}. (Current 24h volume: $${past24hVolume.toFixed(2)}, attempted: $${amountUsd.toFixed(2)})`,
        details: {
          currentTier: tier,
          maxDailyTransactionUsd: limit.maxDailyTransactionUsd,
          past24hVolume,
          attemptedAmountUsd: amountUsd,
        },
      });
    }
  }
}
