/**
 * Account and balance helpers.
 */

import { Horizon, Asset as StellarAsset } from '@stellar/stellar-sdk';
import type { Asset } from '@lumenflow/shared-types';
import { createHorizonClient, withRetry } from './clients';
import { StellarError } from './errors';

/**
 * Loads a Stellar account record from Horizon.
 * Throws ACCOUNT_NOT_FOUND if the account does not exist.
 */
export async function loadAccount(
  publicKey: string,
): Promise<Horizon.AccountResponse> {
  const server = createHorizonClient();
  try {
    return await withRetry(() => server.loadAccount(publicKey));
  } catch (err) {
    if (isNotFoundError(err)) {
      throw new StellarError(
        'ACCOUNT_NOT_FOUND',
        `Account ${publicKey} not found on Stellar network. It may not be funded yet.`,
      );
    }
    throw new StellarError('NETWORK_ERROR', 'Failed to load account.', err);
  }
}

/**
 * Returns the balances for an account as a map of asset → amount string.
 * Key format: "XLM" for native, "CODE:ISSUER" for issued assets.
 */
export async function getBalances(publicKey: string): Promise<Record<string, string>> {
  const account = await loadAccount(publicKey);
  const balances: Record<string, string> = {};

  for (const balance of account.balances) {
    if (balance.asset_type === 'native') {
      balances['XLM'] = balance.balance;
    } else if (
      balance.asset_type === 'credit_alphanum4' ||
      balance.asset_type === 'credit_alphanum12'
    ) {
      const key = `${balance.asset_code}:${balance.asset_issuer}`;
      balances[key] = balance.balance;
    }
  }

  return balances;
}

/**
 * Returns true if the account has a trustline for the given asset.
 * Native XLM always returns true.
 */
export async function hasTrustline(publicKey: string, asset: Asset): Promise<boolean> {
  if (asset.type === 'native') return true;

  const account = await loadAccount(publicKey);
  return account.balances.some(
    (b) =>
      (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
      b.asset_code === asset.code &&
      b.asset_issuer === asset.issuer,
  );
}

/**
 * Calculates the minimum XLM balance required for an account.
 *
 * Formula: (2 + subentries) * base_reserve
 * - base_reserve = 0.5 XLM (5_000_000 stroops)
 * - Each trustline, offer, or data entry adds 1 subentry
 * - Each signer beyond the master adds 1 to the base
 *
 * Reference: https://developers.stellar.org/docs/learn/fundamentals/lumens#minimum-balance
 */
export function calculateMinimumReserve(params: {
  subentryCount: number;
  numSponsored?: number;
  numSponsoring?: number;
}): string {
  const BASE_RESERVE_STROOPS = 5_000_000n; // 0.5 XLM
  const { subentryCount, numSponsored = 0, numSponsoring = 0 } = params;
  const entries = BigInt(2 + subentryCount + numSponsoring - numSponsored);
  const minStroops = entries * BASE_RESERVE_STROOPS;
  // Convert stroops to XLM string with 7 decimal places
  const xlm = Number(minStroops) / 10_000_000;
  return xlm.toFixed(7);
}

/**
 * Converts a shared-types Asset to a Stellar SDK Asset object.
 */
export function toStellarAsset(asset: Asset): StellarAsset {
  if (asset.type === 'native') {
    return StellarAsset.native();
  }
  return new StellarAsset(asset.code, asset.issuer);
}

function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e['response'] && typeof e['response'] === 'object') {
      const res = e['response'] as Record<string, unknown>;
      return res['status'] === 404;
    }
  }
  return false;
}
