/**
 * Core quote engine: getSwapQuote
 *
 * Compares routes from one or more RouteSource implementations and returns
 * the best Quote validated against the shared-types Zod schema.
 */

import { randomUUID } from 'crypto';
import { QuoteSchema } from '@lumenflow/shared-types';
import type { Quote, Asset } from '@lumenflow/shared-types';
import { StellarError } from '@lumenflow/stellar';
import type { RouteSource } from './route-source';
import { HorizonRouteSource } from './horizon-route-source';

/** Quote validity period in seconds. */
const QUOTE_TTL_SECONDS = 30;

/** Base network fee in stroops for a typical swap transaction. */
const TYPICAL_FEE_STROOPS = '200'; // 2 ops × 100 stroops

export interface GetSwapQuoteParams {
  sourceAsset: Asset;
  destinationAsset: Asset;
  /** Amount to send (strict-send mode). */
  sourceAmount: string;
  /** Slippage tolerance as a decimal, e.g. 0.005 for 0.5%. */
  slippageTolerance: number;
  /** Optional: sender public key for Horizon to filter by account's assets. */
  senderPublicKey?: string | undefined;
  /**
   * Optional platform fee as a decimal of the source amount, e.g. 0.001 for 0.1%.
   * Defaults to 0 (no platform fee).
   */
  platformFeeRate?: number | undefined;
  /** Override the route sources (useful for testing). */
  sources?: RouteSource[] | undefined;
}

/**
 * Returns the best swap quote for the given parameters.
 *
 * Algorithm:
 * 1. Query all RouteSource implementations in parallel.
 * 2. Pick the route with the highest destinationAmount.
 * 3. Apply slippage tolerance to compute minimumReceived.
 * 4. Compute price impact as (destinationAmount - minimumReceived) / destinationAmount.
 * 5. Return a validated Quote.
 *
 * Throws StellarError('NO_ROUTE_FOUND') if no routes are available.
 */
export async function getSwapQuote(params: GetSwapQuoteParams): Promise<Quote> {
  const {
    sourceAsset,
    destinationAsset,
    sourceAmount,
    slippageTolerance,
    senderPublicKey,
    platformFeeRate = 0,
    sources = [new HorizonRouteSource()],
  } = params;

  // Query all sources in parallel
  const allRoutes = await Promise.all(
    sources.map((source) =>
      source.findStrictSendRoutes({
        sourceAsset,
        sourceAmount,
        destinationAsset,
        senderPublicKey,
      }),
    ),
  );

  const flatRoutes = allRoutes.flat();

  if (flatRoutes.length === 0) {
    throw new StellarError(
      'NO_ROUTE_FOUND',
      `No swap route found from ${sourceAsset.code} to ${destinationAsset.code}.`,
    );
  }

  // Pick best route: highest destination amount
  const best = flatRoutes.reduce((prev, curr) =>
    parseFloat(curr.destinationAmount) > parseFloat(prev.destinationAmount) ? curr : prev,
  );

  const destAmount = parseFloat(best.destinationAmount);
  const srcAmount = parseFloat(sourceAmount);

  // Minimum received after slippage
  const minimumReceived = (destAmount * (1 - slippageTolerance)).toFixed(7);

  // Price impact = how much the user loses vs the raw output (rough DEX-style estimate)
  const priceImpact = slippageTolerance; // simplified; replace with real pool depth math when available

  // Platform fee in source asset
  const platformFee = (srcAmount * platformFeeRate).toFixed(7);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000);

  const rawQuote = {
    id: randomUUID(),
    sourceAsset,
    destinationAsset,
    sourceAmount,
    destinationAmount: best.destinationAmount,
    minimumReceived,
    slippageTolerance,
    priceImpact,
    networkFee: TYPICAL_FEE_STROOPS,
    platformFee,
    path: best.path.map((asset) => ({ asset })),
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  };

  // Validate against the shared schema — throws ZodError if malformed
  return QuoteSchema.parse(rawQuote);
}
