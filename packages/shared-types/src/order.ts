import { z } from 'zod';
import { AssetSchema } from './asset';
import { OrderStatusSchema } from './order-status';

/**
 * The type of operation an order represents.
 */
export const OrderTypeSchema = z.enum(['SWAP', 'BRIDGE', 'OFFRAMP']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

/**
 * Core order record stored in the database and returned by the API.
 */
export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: OrderTypeSchema,
  status: OrderStatusSchema,
  sourceAsset: AssetSchema,
  destinationAsset: AssetSchema,
  /** Amount sent / to be sent (string to preserve precision). */
  sourceAmount: z.string(),
  /** Amount received / expected (string to preserve precision). */
  destinationAmount: z.string().optional(),
  /** Quote id used to build this order (if applicable). */
  quoteId: z.string().uuid().optional(),
  /** Stellar transaction hash once submitted. */
  stellarTxHash: z.string().optional(),
  /** External provider transfer id (bridge / anchor / payout). */
  externalId: z.string().optional(),
  /** ISO 8601 creation timestamp. */
  createdAt: z.string().datetime(),
  /** ISO 8601 last-update timestamp. */
  updatedAt: z.string().datetime(),
});

export type Order = z.infer<typeof OrderSchema>;
