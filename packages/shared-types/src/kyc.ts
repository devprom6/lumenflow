import { z } from 'zod';

export const KycTierSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type KycTier = z.infer<typeof KycTierSchema>;

export const KycStatusSchema = z.enum([
  'NOT_STARTED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);
export type KycStatus = z.infer<typeof KycStatusSchema>;

export const KycCustomerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tier: KycTierSchema,
  status: KycStatusSchema,
  verifiedAt: z.string().datetime().optional(),
  flags: z.array(z.string()).optional(),
});
export type KycCustomer = z.infer<typeof KycCustomerSchema>;

export interface KycTierLimit {
  tier: KycTier;
  maxSingleTransactionUsd: number;
  maxDailyTransactionUsd: number;
}

export const DEFAULT_KYC_TIER_LIMITS: Record<KycTier, KycTierLimit> = {
  0: { tier: 0, maxSingleTransactionUsd: 50, maxDailyTransactionUsd: 100 },
  1: { tier: 1, maxSingleTransactionUsd: 500, maxDailyTransactionUsd: 1500 },
  2: { tier: 2, maxSingleTransactionUsd: 3000, maxDailyTransactionUsd: 10000 },
  3: { tier: 3, maxSingleTransactionUsd: 25000, maxDailyTransactionUsd: 100000 },
};

export interface KycAdapter {
  readonly name: string;
  getCustomerStatus(userId: string): Promise<KycCustomer>;
  submitVerification(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<KycCustomer>;
}
