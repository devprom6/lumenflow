import { z } from 'zod';

/**
 * Standard API error shape returned by all LumenFlow endpoints.
 *
 * Follows RFC 7807 (Problem Details) loosely.
 */
export const ApiErrorSchema = z.object({
  /** Machine-readable error code, e.g. "QUOTE_EXPIRED" or "ILLEGAL_TRANSITION". */
  code: z.string(),
  /** Human-readable message safe to show to end users. */
  message: z.string(),
  /** HTTP status code. */
  statusCode: z.number().int().min(100).max(599),
  /** Optional additional structured context (varies by error type). */
  details: z.record(z.string(), z.unknown()).optional(),
  /** Correlation / request ID for tracing. */
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Well-known error codes used across the platform.
 * Keeping them in shared-types ensures the frontend can handle them
 * without hard-coding strings.
 */
export const ErrorCode = {
  // Auth
  CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // Quotes
  QUOTE_NOT_FOUND: 'QUOTE_NOT_FOUND',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  NO_ROUTE_FOUND: 'NO_ROUTE_FOUND',

  // Orders
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',

  // Stellar
  TRUSTLINE_MISSING: 'TRUSTLINE_MISSING',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_RESERVE: 'INSUFFICIENT_RESERVE',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',

  // Limits
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  KYC_LIMIT_EXCEEDED: 'KYC_LIMIT_EXCEEDED',

  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
