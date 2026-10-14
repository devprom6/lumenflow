/**
 * Transaction submission and result parsing.
 *
 * Accepts a signed XDR string, submits it to Horizon, and returns a typed result.
 * Maps Stellar result codes to domain errors.
 */

import { TransactionBuilder, Horizon } from '@stellar/stellar-sdk';
import { createHorizonClient } from './clients';
import { getNetworkConfig } from './network';
import { StellarError, mapTransactionResultCode } from './errors';

export interface SubmitTransactionResult {
  /** Stellar transaction hash. */
  hash: string;
  /** Ledger number the transaction was included in. */
  ledger: number;
  /** ISO 8601 timestamp of the transaction. */
  createdAt: string;
}

/**
 * Submits a signed XDR transaction to Horizon.
 *
 * @param signedXdr  Base64-encoded signed transaction XDR.
 * @returns          Typed result on success.
 * @throws           StellarError with a typed code on failure.
 */
export async function submitTransaction(signedXdr: string): Promise<SubmitTransactionResult> {
  const server = createHorizonClient();
  const { networkPassphrase } = getNetworkConfig();

  let transaction;
  try {
    transaction = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  } catch {
    throw new StellarError('SUBMISSION_FAILED', 'Invalid transaction XDR.');
  }

  try {
    const response = (await server.submitTransaction(
      transaction,
    )) as Horizon.HorizonApi.TransactionResponse;

    return {
      hash: response.hash,
      ledger: response.ledger,
      createdAt: response.created_at,
    };
  } catch (err) {
    // Horizon returns error detail in err.response.data
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const data = (e['response'] as Record<string, unknown> | undefined)?.['data'];
      if (data && typeof data === 'object') {
        const resultCodes = (data as Record<string, unknown>)['extras'];
        if (resultCodes && typeof resultCodes === 'object') {
          const codes = (resultCodes as Record<string, unknown>)['result_codes'];
          if (codes && typeof codes === 'object') {
            const codesObj = codes as Record<string, unknown>;
            const opCodes = codesObj['operations'];
            const txCode = codesObj['transaction'];
            const codeStr = Array.isArray(opCodes)
              ? (opCodes as string[]).join(',')
              : (txCode as string) ?? '';
            throw mapTransactionResultCode(codeStr);
          }
        }
      }
    }
    throw new StellarError('SUBMISSION_FAILED', 'Transaction submission failed.', err);
  }
}
