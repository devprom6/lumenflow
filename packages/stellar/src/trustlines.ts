/**
 * Trustline helpers: detection and changeTrust operation builder.
 */

import { Operation, Asset as StellarAsset } from '@stellar/stellar-sdk';
import type { Asset } from '@lumenflow/shared-types';
import { toStellarAsset } from './accounts';

/** The default trustline limit (maximum). */
const DEFAULT_TRUST_LIMIT = '922337203685.4775807';

/**
 * Builds a changeTrust operation to establish a trustline for the given asset.
 * Native XLM does not require a trustline — returns null for native assets.
 *
 * @param asset  The asset to trust.
 * @param limit  Optional custom trust limit; defaults to the maximum.
 */
export function buildChangeTrustOp(
  asset: Asset,
  limit: string = DEFAULT_TRUST_LIMIT,
): ReturnType<typeof Operation.changeTrust> | null {
  if (asset.type === 'native') return null;

  const stellarAsset = toStellarAsset(asset);
  return Operation.changeTrust({
    asset: stellarAsset as StellarAsset,
    limit,
  });
}
