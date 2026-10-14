import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAccount, getBalances, hasTrustline, calculateMinimumReserve } from '../accounts';

// A valid Stellar public key for test fixtures
const VALID_ISSUER = 'GCQVBVSWEAEURR7IYLVL4HITFMI2XLJODFZGKFLHSUJISFOBYTEKQN4S';

// Mock the clients module so tests don't hit the real network
vi.mock('../clients', () => ({
  createHorizonClient: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { createHorizonClient } from '../clients';

function makeBalance(type: string, code?: string, issuer?: string, balance = '100.0000000') {
  return { asset_type: type, asset_code: code, asset_issuer: issuer, balance };
}

function makeAccountResponse(balances: ReturnType<typeof makeBalance>[]) {
  return { balances };
}

describe('loadAccount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns account on success', async () => {
    const mockAccount = makeAccountResponse([makeBalance('native', undefined, undefined, '50.0000000')]);
    vi.mocked(createHorizonClient).mockReturnValue({
      loadAccount: vi.fn().mockResolvedValue(mockAccount),
    } as never);

    const result = await loadAccount('GABCDEF');
    expect(result).toBe(mockAccount);
  });

  it('throws ACCOUNT_NOT_FOUND for 404', async () => {
    vi.mocked(createHorizonClient).mockReturnValue({
      loadAccount: vi.fn().mockRejectedValue({ response: { status: 404 } }),
    } as never);

    await expect(loadAccount('GABCDEF')).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
    });
  });
});

describe('getBalances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns XLM and issued asset balances', async () => {
    const mockAccount = makeAccountResponse([
      makeBalance('native', undefined, undefined, '50.0000000'),
      makeBalance('credit_alphanum4', 'USDC', VALID_ISSUER, '10.0000000'),
    ]);
    vi.mocked(createHorizonClient).mockReturnValue({
      loadAccount: vi.fn().mockResolvedValue(mockAccount),
    } as never);

    const balances = await getBalances('GABCDEF');
    expect(balances['XLM']).toBe('50.0000000');
    expect(balances[`USDC:${VALID_ISSUER}`]).toBe('10.0000000');
  });
});

describe('hasTrustline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true for native XLM without hitting Horizon', async () => {
    const mockHorizon = { loadAccount: vi.fn() };
    vi.mocked(createHorizonClient).mockReturnValue(mockHorizon as never);

    const result = await hasTrustline('GABCDEF', { type: 'native', code: 'XLM' });
    expect(result).toBe(true);
    expect(mockHorizon.loadAccount).not.toHaveBeenCalled();
  });

  it('returns true when trustline exists', async () => {
    const mockAccount = makeAccountResponse([
      makeBalance('credit_alphanum4', 'USDC', VALID_ISSUER),
    ]);
    vi.mocked(createHorizonClient).mockReturnValue({
      loadAccount: vi.fn().mockResolvedValue(mockAccount),
    } as never);

    const result = await hasTrustline('GABCDEF', {
      type: 'credit_alphanum4',
      code: 'USDC',
      issuer: VALID_ISSUER,
    });
    expect(result).toBe(true);
  });

  it('returns false when trustline is missing', async () => {
    const mockAccount = makeAccountResponse([makeBalance('native')]);
    vi.mocked(createHorizonClient).mockReturnValue({
      loadAccount: vi.fn().mockResolvedValue(mockAccount),
    } as never);

    const result = await hasTrustline('GABCDEF', {
      type: 'credit_alphanum4',
      code: 'USDC',
      issuer: VALID_ISSUER,
    });
    expect(result).toBe(false);
  });
});

describe('calculateMinimumReserve', () => {
  it('returns 1.0000000 XLM for an account with 0 subentries', () => {
    // (2 + 0) * 0.5 = 1 XLM
    expect(calculateMinimumReserve({ subentryCount: 0 })).toBe('1.0000000');
  });

  it('returns 2.0000000 XLM for an account with 2 subentries (e.g. 2 trustlines)', () => {
    // (2 + 2) * 0.5 = 2 XLM
    expect(calculateMinimumReserve({ subentryCount: 2 })).toBe('2.0000000');
  });

  it('accounts for numSponsoring', () => {
    // (2 + 1 + 1) * 0.5 = 2 XLM
    expect(calculateMinimumReserve({ subentryCount: 1, numSponsoring: 1 })).toBe('2.0000000');
  });
});
