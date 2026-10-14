import { describe, it, expect } from 'vitest';
import { AssetSchema } from '../asset';

describe('AssetSchema', () => {
  it('parses native XLM', () => {
    const result = AssetSchema.safeParse({ type: 'native', code: 'XLM' });
    expect(result.success).toBe(true);
  });

  it('parses credit_alphanum4 with issuer', () => {
    const result = AssetSchema.safeParse({
      type: 'credit_alphanum4',
      code: 'USDC',
      issuer: 'G'.repeat(56),
    });
    expect(result.success).toBe(true);
  });

  it('rejects credit_alphanum4 without issuer', () => {
    const result = AssetSchema.safeParse({ type: 'credit_alphanum4', code: 'USDC' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown type', () => {
    const result = AssetSchema.safeParse({ type: 'unknown', code: 'FOO' });
    expect(result.success).toBe(false);
  });
});
