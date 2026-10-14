/**
 * Typed domain errors for all Stellar operations.
 */

export type StellarErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'TRUSTLINE_MISSING'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_RESERVE'
  | 'NO_ROUTE_FOUND'
  | 'TRANSACTION_FAILED'
  | 'SUBMISSION_FAILED'
  | 'NETWORK_ERROR'
  | 'MAINNET_REJECTED';

export class StellarError extends Error {
  readonly code: StellarErrorCode;
  readonly details?: unknown;

  constructor(code: StellarErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'StellarError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Maps a Stellar transaction result code string to a typed StellarError.
 * Result codes: https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes
 */
export function mapTransactionResultCode(resultCode: string): StellarError {
  if (resultCode.includes('op_no_trust')) {
    return new StellarError('TRUSTLINE_MISSING', 'Destination trustline missing.');
  }
  if (resultCode.includes('op_underfunded') || resultCode.includes('op_src_no_trust')) {
    return new StellarError('INSUFFICIENT_BALANCE', 'Insufficient balance.');
  }
  if (resultCode.includes('op_low_reserve') || resultCode.includes('tx_insufficient_balance')) {
    return new StellarError('INSUFFICIENT_RESERVE', 'Insufficient XLM reserve.');
  }
  if (resultCode.includes('op_no_destination') || resultCode.includes('op_too_few_offers')) {
    return new StellarError('NO_ROUTE_FOUND', 'No route found for this swap.');
  }
  return new StellarError('TRANSACTION_FAILED', `Transaction failed: ${resultCode}`, resultCode);
}
