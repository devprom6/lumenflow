import { z } from 'zod';
import { AssetSchema } from './asset';

export const OfframpFeeBreakdownSchema = z.object({
  anchorFee: z.string(),
  networkFee: z.string(),
  platformFee: z.string(),
  totalFee: z.string(),
});
export type OfframpFeeBreakdown = z.infer<typeof OfframpFeeBreakdownSchema>;

export const OfframpQuoteSchema = z.object({
  id: z.string().uuid(),
  sourceAsset: AssetSchema,
  destinationCurrency: z.string(),
  sourceAmount: z.string(),
  destinationAmount: z.string(),
  exchangeRate: z.string(),
  feeBreakdown: OfframpFeeBreakdownSchema,
  rateLockDurationSeconds: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type OfframpQuote = z.infer<typeof OfframpQuoteSchema>;

export const OfframpQuoteRequestSchema = z.object({
  sourceAsset: AssetSchema,
  destinationCurrency: z.string().min(3).max(4),
  sourceAmount: z.string(),
  userAddress: z.string().optional(),
});
export type OfframpQuoteRequest = z.infer<typeof OfframpQuoteRequestSchema>;

export const OfframpOrderRequestSchema = z.object({
  quoteId: z.string().uuid(),
  userAddress: z.string().length(56),
  destinationDetails: z.record(z.string(), z.string()).optional(),
});
export type OfframpOrderRequest = z.infer<typeof OfframpOrderRequestSchema>;
