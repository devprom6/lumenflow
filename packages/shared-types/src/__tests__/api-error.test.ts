import { describe, it, expect } from 'vitest';
import { ApiErrorSchema, ErrorCode } from '../api-error';

describe('ApiErrorSchema', () => {
  it('parses a valid error', () => {
    const result = ApiErrorSchema.safeParse({
      code: ErrorCode.QUOTE_EXPIRED,
      message: 'The quote has expired.',
      statusCode: 410,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when statusCode is out of range', () => {
    const result = ApiErrorSchema.safeParse({
      code: 'ERR',
      message: 'bad',
      statusCode: 99,
    });
    expect(result.success).toBe(false);
  });

  it('allows optional details and requestId', () => {
    const result = ApiErrorSchema.safeParse({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid input.',
      statusCode: 422,
      details: { field: 'amount', issue: 'must be positive' },
      requestId: 'req-123',
    });
    expect(result.success).toBe(true);
  });
});

describe('ErrorCode', () => {
  it('has QUOTE_EXPIRED', () => {
    expect(ErrorCode.QUOTE_EXPIRED).toBe('QUOTE_EXPIRED');
  });
});
