/**
 * Horizon and RPC client factories with retry/backoff.
 */

import { Horizon, rpc as StellarRpc } from '@stellar/stellar-sdk';
import { getNetworkConfig } from './network';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

/**
 * Creates a Horizon server instance configured for the active network.
 */
export function createHorizonClient(): Horizon.Server {
  const { horizonUrl } = getNetworkConfig();
  return new Horizon.Server(horizonUrl, { allowHttp: horizonUrl.startsWith('http://') });
}

/**
 * Creates a Soroban RPC server instance configured for the active network.
 */
export function createRpcClient(): StellarRpc.Server {
  const { rpcUrl } = getNetworkConfig();
  return new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
}

/**
 * Wraps an async operation with exponential backoff retry.
 * Retries on network errors; does not retry on 4xx application errors.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  backoffMs: number = BASE_BACKOFF_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), DEFAULT_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      lastError = err;
      // Don't retry on last attempt
      if (attempt < retries) {
        await sleep(backoffMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
