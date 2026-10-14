import { describe, it, expect } from 'vitest';
import { isLegalTransition, LEGAL_TRANSITIONS, OrderStatusSchema } from '../order-status';
import type { OrderStatus } from '../order-status';

describe('OrderStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses: OrderStatus[] = [
      'CREATED', 'QUOTED', 'AWAITING_SIGNATURE', 'SUBMITTED',
      'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'REFUNDED',
    ];
    for (const s of statuses) {
      expect(OrderStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects an invalid status', () => {
    expect(OrderStatusSchema.safeParse('UNKNOWN').success).toBe(false);
  });
});

describe('isLegalTransition', () => {
  it('allows CREATED -> QUOTED', () => {
    expect(isLegalTransition('CREATED', 'QUOTED')).toBe(true);
  });

  it('allows PROCESSING -> COMPLETED', () => {
    expect(isLegalTransition('PROCESSING', 'COMPLETED')).toBe(true);
  });

  it('allows PROCESSING -> REFUNDED', () => {
    expect(isLegalTransition('PROCESSING', 'REFUNDED')).toBe(true);
  });

  it('disallows COMPLETED -> FAILED', () => {
    expect(isLegalTransition('COMPLETED', 'FAILED')).toBe(false);
  });

  it('disallows CREATED -> COMPLETED (skip)', () => {
    expect(isLegalTransition('CREATED', 'COMPLETED')).toBe(false);
  });

  it('disallows EXPIRED -> QUOTED (backwards)', () => {
    expect(isLegalTransition('EXPIRED', 'QUOTED')).toBe(false);
  });

  it('terminal states have no outgoing transitions (except FAILED -> REFUNDED)', () => {
    expect(LEGAL_TRANSITIONS['COMPLETED']).toHaveLength(0);
    expect(LEGAL_TRANSITIONS['EXPIRED']).toHaveLength(0);
    expect(LEGAL_TRANSITIONS['REFUNDED']).toHaveLength(0);
  });
});
