import { describe, it, expect } from 'vitest';
import { getSwapQuote } from '../quote-engine';
import type { RouteSource, RouteResult } from '../route-source';
import type { Asset } from '@lumenflow/shared-types';

const XLM: Asset = { type: 'native', code: 'XLM' };
const USDC: Asset = {
  type: 'credit_alphanum4',
  code: 'USDC',
  issuer: 'G' + 'A'.repeat(55),
};

/** Mock RouteSource that returns configurable routes. */
function makeSource(routes: RouteResult[]): RouteSource {
  return {
    name: 'mock',
    findStrictSendRoutes: () => Promise.resolve(routes),
    findStrictReceiveRoutes: () => Promise.resolve(routes),
  };
}

describe('getSwapQuote', () => {
  it('returns a valid Quote for a successful route', async () => {
    const mockRoutes: RouteResult[] = [
      { path: [], sourceAmount: '10.0000000', destinationAmount: '9.8000000' },
    ];

    const quote = await getSwapQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '10.0000000',
      slippageTolerance: 0.005,
      sources: [makeSource(mockRoutes)],
    });

    expect(quote.sourceAsset).toMatchObject({ type: 'native', code: 'XLM' });
    expect(quote.destinationAsset).toMatchObject({ type: 'credit_alphanum4', code: 'USDC' });
    expect(quote.destinationAmount).toBe('9.8000000');
    expect(parseFloat(quote.minimumReceived)).toBeLessThan(parseFloat(quote.destinationAmount));
    expect(quote.id).toBeTruthy();
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('picks the best route when multiple are available', async () => {
    const routes: RouteResult[] = [
      { path: [], sourceAmount: '10.0000000', destinationAmount: '9.5000000' },
      { path: [], sourceAmount: '10.0000000', destinationAmount: '9.9000000' },
      { path: [], sourceAmount: '10.0000000', destinationAmount: '9.7000000' },
    ];

    const quote = await getSwapQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '10.0000000',
      slippageTolerance: 0.005,
      sources: [makeSource(routes)],
    });

    expect(quote.destinationAmount).toBe('9.9000000');
  });

  it('aggregates routes from multiple sources and picks best', async () => {
    const source1 = makeSource([{ path: [], sourceAmount: '10', destinationAmount: '9.5000000' }]);
    const source2 = makeSource([{ path: [], sourceAmount: '10', destinationAmount: '9.8000000' }]);

    const quote = await getSwapQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '10.0000000',
      slippageTolerance: 0.005,
      sources: [source1, source2],
    });

    expect(quote.destinationAmount).toBe('9.8000000');
  });

  it('throws StellarError(NO_ROUTE_FOUND) when no routes available', async () => {
    await expect(
      getSwapQuote({
        sourceAsset: XLM,
        destinationAsset: USDC,
        sourceAmount: '10.0000000',
        slippageTolerance: 0.005,
        sources: [makeSource([])],
      }),
    ).rejects.toMatchObject({ code: 'NO_ROUTE_FOUND' });
  });

  it('includes platform fee when platformFeeRate is set', async () => {
    const quote = await getSwapQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '100.0000000',
      slippageTolerance: 0.005,
      platformFeeRate: 0.001,
      sources: [makeSource([{ path: [], sourceAmount: '100', destinationAmount: '99.0000000' }])],
    });

    // Platform fee = 100 * 0.001 = 0.1
    expect(parseFloat(quote.platformFee)).toBeCloseTo(0.1, 5);
  });

  it('quote expires within 30 seconds', async () => {
    const quote = await getSwapQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '10.0000000',
      slippageTolerance: 0.005,
      sources: [makeSource([{ path: [], sourceAmount: '10', destinationAmount: '9.8000000' }])],
    });

    const ttlMs = new Date(quote.expiresAt).getTime() - new Date(quote.createdAt).getTime();
    expect(ttlMs).toBeLessThanOrEqual(30_000 + 100); // 30s + small tolerance
    expect(ttlMs).toBeGreaterThan(0);
  });
});
