import { describe, it, expect, vi } from 'vitest';
import { HorizonRouteSource } from '../horizon-route-source';
import * as stellar from '@lumenflow/stellar';
import type { Asset } from '@lumenflow/shared-types';

vi.mock('@lumenflow/stellar', () => ({
  findStrictSendPaths: vi.fn(),
  findStrictReceivePaths: vi.fn(),
}));

const XLM: Asset = { type: 'native', code: 'XLM' };
const USDC: Asset = {
  type: 'credit_alphanum4',
  code: 'USDC',
  issuer: 'G' + 'A'.repeat(55),
};

describe('HorizonRouteSource', () => {
  const source = new HorizonRouteSource();

  it('has name "horizon"', () => {
    expect(source.name).toBe('horizon');
  });

  it('finds strict send routes successfully', async () => {
    vi.mocked(stellar.findStrictSendPaths).mockResolvedValueOnce([
      {
        path: [],
        sourceAmount: '10.0000000',
        destinationAmount: '9.8000000',
        sourceAsset: XLM,
        destinationAsset: USDC,
      },
    ]);

    const routes = await source.findStrictSendRoutes({
      sourceAsset: XLM,
      sourceAmount: '10.0000000',
      destinationAsset: USDC,
      senderPublicKey: 'G' + 'A'.repeat(55),
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.destinationAmount).toBe('9.8000000');
  });

  it('catches and returns empty array on strict send path error', async () => {
    vi.mocked(stellar.findStrictSendPaths).mockRejectedValueOnce(
      new Error('Horizon offline'),
    );

    const routes = await source.findStrictSendRoutes({
      sourceAsset: XLM,
      sourceAmount: '10.0000000',
      destinationAsset: USDC,
    });

    expect(routes).toEqual([]);
  });

  it('finds strict receive routes successfully', async () => {
    vi.mocked(stellar.findStrictReceivePaths).mockResolvedValueOnce([
      {
        path: [],
        sourceAmount: '10.2000000',
        destinationAmount: '10.0000000',
        sourceAsset: XLM,
        destinationAsset: USDC,
      },
    ]);

    const routes = await source.findStrictReceiveRoutes({
      sourceAsset: XLM,
      destinationAsset: USDC,
      destinationAmount: '10.0000000',
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.sourceAmount).toBe('10.2000000');
  });

  it('catches and returns empty array on strict receive path error', async () => {
    vi.mocked(stellar.findStrictReceivePaths).mockRejectedValueOnce(
      new Error('Network error'),
    );

    const routes = await source.findStrictReceiveRoutes({
      sourceAsset: XLM,
      destinationAsset: USDC,
      destinationAmount: '10.0000000',
    });

    expect(routes).toEqual([]);
  });
});
