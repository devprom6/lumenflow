import { describe, it, expect } from 'vitest';
import { getNetworkConfig } from '../network';

describe('getNetworkConfig', () => {
  it('returns testnet config by default', () => {
    const config = getNetworkConfig();
    expect(config.network).toBe('TESTNET');
    expect(config.horizonUrl).toContain('testnet');
    expect(config.networkPassphrase).toContain('Test SDF');
  });

  it('throws when STELLAR_NETWORK=PUBLIC', () => {
    const original = process.env['STELLAR_NETWORK'];
    process.env['STELLAR_NETWORK'] = 'PUBLIC';
    expect(() => getNetworkConfig()).toThrow('Mainnet is not supported');
    process.env['STELLAR_NETWORK'] = original;
  });

  it('throws when STELLAR_NETWORK=MAINNET', () => {
    const original = process.env['STELLAR_NETWORK'];
    process.env['STELLAR_NETWORK'] = 'MAINNET';
    expect(() => getNetworkConfig()).toThrow('Mainnet is not supported');
    process.env['STELLAR_NETWORK'] = original;
  });

  it('uses STELLAR_HORIZON_URL env var when set', () => {
    const original = process.env['STELLAR_HORIZON_URL'];
    process.env['STELLAR_HORIZON_URL'] = 'https://custom-horizon.example.com';
    const config = getNetworkConfig();
    expect(config.horizonUrl).toBe('https://custom-horizon.example.com');
    process.env['STELLAR_HORIZON_URL'] = original;
  });
});
