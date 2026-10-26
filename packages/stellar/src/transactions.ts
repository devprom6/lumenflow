/**
 * Unsigned swap transaction builder.
 *
 * Builds a pathPaymentStrictSend or pathPaymentStrictReceive transaction.
 * Automatically prepends a changeTrust operation when the destination
 * trustline is missing — the README requires this behaviour.
 *
 * The transaction is returned as an unsigned XDR string. The user must
 * sign it in their own wallet. The backend NEVER signs on behalf of users.
 */

import {
  TransactionBuilder,
  Operation,
  Memo,
} from '@stellar/stellar-sdk';
import type { Asset } from '@lumenflow/shared-types';
import { loadAccount, hasTrustline, toStellarAsset } from './accounts';
import { buildChangeTrustOp } from './trustlines';
import { getNetworkConfig } from './network';
import { StellarError } from './errors';

/** Default transaction fee in stroops (100 = 0.00001 XLM). */
const BASE_FEE = '100';
/** Transaction validity window in seconds. */
const TIMEOUT_SECONDS = 300; // 5 minutes

export interface BuildSwapTransactionParams {
  /** The wallet public key that will sign and send. */
  senderPublicKey: string;
  /** Asset being sold. */
  sourceAsset: Asset;
  /** Asset being bought. */
  destinationAsset: Asset;
  /** Amount of source asset to send (for strict-send). */
  sourceAmount: string;
  /** Minimum amount of destination asset to receive. */
  minimumDestinationAmount: string;
  /** Intermediate path assets (can be empty). */
  path: Asset[];
  /** Optional text memo. */
  memo?: string | undefined;
}

export interface BuildSwapTransactionResult {
  /** Unsigned transaction encoded as base64 XDR. */
  unsignedXdr: string;
  /** True if a changeTrust operation was prepended. */
  addedTrustline: boolean;
}

/**
 * Builds an unsigned swap transaction.
 *
 * Steps:
 * 1. Load the sender's account from Horizon to get the sequence number.
 * 2. Check whether the destination trustline exists; if not, prepend changeTrust.
 * 3. Append the pathPaymentStrictSend operation.
 * 4. Return the unsigned XDR — the caller must have the user sign it.
 */
export async function buildSwapTransaction(
  params: BuildSwapTransactionParams,
): Promise<BuildSwapTransactionResult> {
  const {
    senderPublicKey,
    sourceAsset,
    destinationAsset,
    sourceAmount,
    minimumDestinationAmount,
    path,
    memo,
  } = params;

  const { networkPassphrase } = getNetworkConfig();

  // 1. Load account (throws ACCOUNT_NOT_FOUND if unfunded)
  const account = await loadAccount(senderPublicKey);

  // 2. Check trustline for destination asset
  const trustlineExists = await hasTrustline(senderPublicKey, destinationAsset);

  const stellarSource = toStellarAsset(sourceAsset);
  const stellarDest = toStellarAsset(destinationAsset);
  const stellarPath = path.map(toStellarAsset);

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  }).setTimeout(TIMEOUT_SECONDS);

  // 2a. Prepend changeTrust if needed
  let addedTrustline = false;
  if (!trustlineExists) {
    const trustOp = buildChangeTrustOp(destinationAsset);
    if (trustOp) {
      builder.addOperation(trustOp);
      addedTrustline = true;
    }
  }

  // 3. pathPaymentStrictSend: send exactly sourceAmount, receive at least minimumDestinationAmount
  builder.addOperation(
    Operation.pathPaymentStrictSend({
      sendAsset: stellarSource,
      sendAmount: sourceAmount,
      destination: senderPublicKey,
      destAsset: stellarDest,
      destMin: minimumDestinationAmount,
      path: stellarPath,
    }),
  );

  if (memo) {
    builder.addMemo(Memo.text(memo));
  }

  const transaction = builder.build();

  // Validate the network passphrase is for Testnet
  if (!networkPassphrase.includes('Test SDF')) {
    throw new StellarError(
      'MAINNET_REJECTED',
      'Mainnet transactions are not supported in this build.',
    );
  }

  return {
    unsignedXdr: transaction.toXDR(),
    addedTrustline,
  };
}

/**
 * Builds an unsigned pathPaymentStrictReceive transaction.
 * The user receives exactly `destinationAmount`; the source amount is capped at `maxSourceAmount`.
 */
export async function buildStrictReceiveSwapTransaction(params: {
  senderPublicKey: string;
  sourceAsset: Asset;
  destinationAsset: Asset;
  destinationAmount: string;
  maxSourceAmount: string;
  path: Asset[];
  memo?: string;
}): Promise<BuildSwapTransactionResult> {
  const {
    senderPublicKey,
    sourceAsset,
    destinationAsset,
    destinationAmount,
    maxSourceAmount,
    path,
    memo,
  } = params;

  const { networkPassphrase } = getNetworkConfig();
  const account = await loadAccount(senderPublicKey);
  const trustlineExists = await hasTrustline(senderPublicKey, destinationAsset);

  const stellarSource = toStellarAsset(sourceAsset);
  const stellarDest = toStellarAsset(destinationAsset);
  const stellarPath = path.map(toStellarAsset);

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  }).setTimeout(TIMEOUT_SECONDS);

  let addedTrustline = false;
  if (!trustlineExists) {
    const trustOp = buildChangeTrustOp(destinationAsset);
    if (trustOp) {
      builder.addOperation(trustOp);
      addedTrustline = true;
    }
  }

  builder.addOperation(
    Operation.pathPaymentStrictReceive({
      sendAsset: stellarSource,
      sendMax: maxSourceAmount,
      destination: senderPublicKey,
      destAsset: stellarDest,
      destAmount: destinationAmount,
      path: stellarPath,
    }),
  );

  if (memo) {
    builder.addMemo(Memo.text(memo));
  }

  const transaction = builder.build();
  return { unsignedXdr: transaction.toXDR(), addedTrustline };
}
