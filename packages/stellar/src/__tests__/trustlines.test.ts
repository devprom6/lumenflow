import { describe, it, expect } from 'vitest';
import { buildChangeTrustOp } from '../trustlines';
import type { Asset } from '@lumenflow/shared-types';

// A valid Stellar public key for test fixtures
const VALID_ISSUER = 'GCQVBVSWEAEURR7IYLVL4HITFMI2XLJODFZGKFLHSUJISFOBYTEKQN4S';

describe('buildChangeTrustOp', () => {
  it('returns null for native XLM (no trustline needed)', () => {
    const asset: Asset = { type: 'native', code: 'XLM' };
    expect(buildChangeTrustOp(asset)).toBeNull();
  });

  it('returns a non-null operation for a credit_alphanum4 asset', () => {
    const asset: Asset = {
      type: 'credit_alphanum4',
      code: 'USDC',
      issuer: VALID_ISSUER,
    };
    const op = buildChangeTrustOp(asset);
    expect(op).not.toBeNull();
    expect(op).toBeDefined();
  });

  it('returns a non-null operation for a credit_alphanum12 asset', () => {
    const asset: Asset = {
      type: 'credit_alphanum12',
      code: 'LONGTOKEN',
      issuer: VALID_ISSUER,
    };
    const op = buildChangeTrustOp(asset);
    expect(op).not.toBeNull();
    expect(op).toBeDefined();
  });
});
