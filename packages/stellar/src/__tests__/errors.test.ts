import { describe, it, expect } from 'vitest';
import { StellarError, mapTransactionResultCode } from '../errors';

describe('StellarError', () => {
  it('constructs with code and message', () => {
    const err = new StellarError('ACCOUNT_NOT_FOUND', 'Account not found');
    expect(err.code).toBe('ACCOUNT_NOT_FOUND');
    expect(err.message).toBe('Account not found');
    expect(err.name).toBe('StellarError');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof StellarError).toBe(true);
  });
});

describe('mapTransactionResultCode', () => {
  it('maps op_no_trust to TRUSTLINE_MISSING', () => {
    const err = mapTransactionResultCode('op_no_trust');
    expect(err.code).toBe('TRUSTLINE_MISSING');
  });

  it('maps op_underfunded to INSUFFICIENT_BALANCE', () => {
    const err = mapTransactionResultCode('op_underfunded');
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('maps op_low_reserve to INSUFFICIENT_RESERVE', () => {
    const err = mapTransactionResultCode('op_low_reserve');
    expect(err.code).toBe('INSUFFICIENT_RESERVE');
  });

  it('maps op_too_few_offers to NO_ROUTE_FOUND', () => {
    const err = mapTransactionResultCode('op_too_few_offers');
    expect(err.code).toBe('NO_ROUTE_FOUND');
  });

  it('maps unknown codes to TRANSACTION_FAILED', () => {
    const err = mapTransactionResultCode('tx_bad_seq');
    expect(err.code).toBe('TRANSACTION_FAILED');
    expect(err.details).toBe('tx_bad_seq');
  });
});
