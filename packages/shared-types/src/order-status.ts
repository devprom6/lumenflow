import { z } from 'zod';

/**
 * All valid states an order can be in.
 * Matches the state-machine diagram in README.md:
 *
 *   CREATED → QUOTED → AWAITING_SIGNATURE → SUBMITTED → PROCESSING → COMPLETED
 *                                                     ↘ FAILED / EXPIRED / REFUNDED
 */
export const OrderStatusSchema = z.enum([
  'CREATED',
  'QUOTED',
  'AWAITING_SIGNATURE',
  'SUBMITTED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
]);

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/**
 * Legal state transitions.
 * Attempting any transition not listed here must throw a typed error.
 */
export const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['QUOTED', 'EXPIRED'],
  QUOTED: ['AWAITING_SIGNATURE', 'EXPIRED'],
  AWAITING_SIGNATURE: ['SUBMITTED', 'EXPIRED', 'FAILED'],
  SUBMITTED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED', 'REFUNDED'],
  COMPLETED: [],
  FAILED: ['REFUNDED'],
  EXPIRED: [],
  REFUNDED: [],
};

/** Returns true if transitioning from `from` to `to` is legal. */
export function isLegalTransition(from: OrderStatus, to: OrderStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}
