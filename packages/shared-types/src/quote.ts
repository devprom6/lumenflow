import { z } from 'zod';
import { AssetSchema } from './asset';

/**
 * A single hop in a payment path returned by Stellar path-finding.
 */
export const RouteHopSchema = z.object({
  asset: AssetSchema,
});

/**
 * A swap quote returned by the quote engine.
 *
 * All amounts are strings to avoid floating-point precision loss.
 * They represent asset amounts with full decimal precision (e.g. "10.5000000").
 */
export const QuoteSchema = z.object({
  id: z.string().uuid(),
  sourceAsset: AssetSchema,
  destinationAsset: AssetSchema,
  /** Amount the user will send (strict-send) or must send (strict-receive). */
  sourceAmount: z.string(),
  /** Expected amount the user will receive. */
  destinationAmount: z.string(),
  /** Minimum received after slippage tolerance is applied. */
  minimumReceived: z.string(),
  /** Slippage tolerance as a decimal, e.g. 0.005 for 0.5%. */
  slippageTolerance: z.number().min(0).max(1),
  /** Price impact as a decimal. */
  priceImpact: z.number().min(0),
  /** XLM network fee in stroops (string to avoid precision loss). */
  networkFee: z.string(),
  /** Platform fee in the source asset amount (string). */
  platformFee: z.string(),
  /** Intermediate hops in the payment path (empty for direct swaps). */
  path: z.array(RouteHopSchema),
  /** ISO 8601 timestamp when this quote expires. */
  expiresAt: z.string().datetime(),
  /** ISO 8601 timestamp when this quote was created. */
  createdAt: z.string().datetime(),
});

export type Quote = z.infer<typeof QuoteSchema>;
export type RouteHop = z.infer<typeof RouteHopSchema>;
