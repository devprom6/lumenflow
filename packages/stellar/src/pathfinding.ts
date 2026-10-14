/**
 * Path-finding wrappers for Stellar strict-send and strict-receive.
 *
 * These call the Horizon path-finding endpoints and return typed results.
 * The backend uses these to populate quotes before building transactions.
 */

import type { Asset } from '@lumenflow/shared-types';
import { createHorizonClient, withRetry } from './clients';
import { toStellarAsset } from './accounts';
import { StellarError } from './errors';

export interface PathFindResult {
  /** Path of intermediate assets (can be empty for direct swaps). */
  path: Asset[];
  /** Source amount (for strict-receive, this is what the user will pay). */
  sourceAmount: string;
  /** Destination amount (for strict-send, this is what the user will receive). */
  destinationAmount: string;
}

/**
 * Finds paths for a strict-send payment:
 * the user sends exactly `sourceAmount` and receives as much destination asset as possible.
 */
export async function findStrictSendPaths(params: {
  sourceAsset: Asset;
  sourceAmount: string;
  destinationAsset: Asset;
  sourcePublicKey?: string | undefined;
}): Promise<PathFindResult[]> {
  const server = createHorizonClient();
  const { sourceAsset, sourceAmount, destinationAsset, sourcePublicKey } = params;

  const stellarSource = toStellarAsset(sourceAsset);
  const stellarDest = toStellarAsset(destinationAsset);

  try {
    let builder = server
      .strictSendPaths(stellarSource, sourceAmount, [stellarDest])
      .limit(5);

    if (sourcePublicKey) {
      builder = server.strictSendPaths(stellarSource, sourceAmount, sourcePublicKey).limit(5);
    }

    const response = await withRetry(() => builder.call());

    return response.records.map((record) => ({
      path: record.path.map((hop) => {
        if (hop.asset_type === 'native') {
          return { type: 'native' as const, code: 'XLM' as const };
        }
        return {
          type: hop.asset_type as 'credit_alphanum4' | 'credit_alphanum12',
          code: hop.asset_code ?? '',
          issuer: hop.asset_issuer ?? '',
        };
      }),
      sourceAmount: record.source_amount,
      destinationAmount: record.destination_amount,
    }));
  } catch (err) {
    if (err instanceof StellarError) throw err;
    throw new StellarError('NO_ROUTE_FOUND', 'No path found for strict-send.', err);
  }
}

/**
 * Finds paths for a strict-receive payment:
 * the user receives exactly `destinationAmount` and pays as little source asset as possible.
 */
export async function findStrictReceivePaths(params: {
  sourceAsset: Asset;
  destinationAsset: Asset;
  destinationAmount: string;
  sourcePublicKey?: string | undefined;
}): Promise<PathFindResult[]> {
  const server = createHorizonClient();
  const { sourceAsset, destinationAsset, destinationAmount, sourcePublicKey } = params;

  const stellarSource = toStellarAsset(sourceAsset);
  const stellarDest = toStellarAsset(destinationAsset);

  try {
    let builder = server
      .strictReceivePaths([stellarSource], stellarDest, destinationAmount)
      .limit(5);

    if (sourcePublicKey) {
      builder = server
        .strictReceivePaths(sourcePublicKey, stellarDest, destinationAmount)
        .limit(5);
    }

    const response = await withRetry(() => builder.call());

    return response.records.map((record) => ({
      path: record.path.map((hop) => {
        if (hop.asset_type === 'native') {
          return { type: 'native' as const, code: 'XLM' as const };
        }
        return {
          type: hop.asset_type as 'credit_alphanum4' | 'credit_alphanum12',
          code: hop.asset_code ?? '',
          issuer: hop.asset_issuer ?? '',
        };
      }),
      sourceAmount: record.source_amount,
      destinationAmount: record.destination_amount,
    }));
  } catch (err) {
    if (err instanceof StellarError) throw err;
    throw new StellarError('NO_ROUTE_FOUND', 'No path found for strict-receive.', err);
  }
}
