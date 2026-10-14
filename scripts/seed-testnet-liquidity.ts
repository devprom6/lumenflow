#!/usr/bin/env ts-node
/**
 * scripts/seed-testnet-liquidity.ts
 *
 * Issues a test asset (LMFT – LumenFlow Test Token) and creates a sell
 * offer on the Stellar Testnet order book so that XLM <-> LMFT swaps
 * can be demonstrated without real liquidity.
 *
 * Prerequisites:
 *   - Set ISSUER_SECRET and DISTRIBUTOR_SECRET in the environment
 *     (or run scripts/create-testnet-account.ts twice to generate them).
 *
 * Usage:
 *   ISSUER_SECRET=S... DISTRIBUTOR_SECRET=S... ts-node scripts/seed-testnet-liquidity.ts
 *
 * SECURITY: For Testnet development only. Never use real keys or funds.
 */

import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Networks,
  Horizon,
} from '@stellar/stellar-sdk';

const HORIZON_URL =
  process.env['STELLAR_HORIZON_URL'] ?? 'https://horizon-testnet.stellar.org';
const TEST_ASSET_CODE = 'LMFT';
const ISSUE_AMOUNT = '1000000';
const OFFER_SELL_AMOUNT = '500000';
const OFFER_PRICE = '1'; // 1 XLM per LMFT

async function main(): Promise<void> {
  const network = (process.env['STELLAR_NETWORK'] ?? 'TESTNET').toUpperCase();
  if (network === 'PUBLIC' || network === 'MAINNET') {
    console.error('ERROR: This script must only be used on Testnet.');
    process.exit(1);
  }

  const issuerSecret = process.env['ISSUER_SECRET'];
  const distributorSecret = process.env['DISTRIBUTOR_SECRET'];

  if (!issuerSecret || !distributorSecret) {
    console.error(
      'ERROR: Set ISSUER_SECRET and DISTRIBUTOR_SECRET environment variables.\n' +
        'Run scripts/create-testnet-account.ts twice to generate funded testnet accounts.',
    );
    process.exit(1);
  }

  const issuer = Keypair.fromSecret(issuerSecret);
  const distributor = Keypair.fromSecret(distributorSecret);

  const server = new Horizon.Server(HORIZON_URL);
  const testAsset = new Asset(TEST_ASSET_CODE, issuer.publicKey());

  console.log(`Issuer     : ${issuer.publicKey()}`);
  console.log(`Distributor: ${distributor.publicKey()}`);
  console.log(`Asset      : ${TEST_ASSET_CODE}:${issuer.publicKey()}\n`);

  // Step 1: Distributor establishes trustline for LMFT
  console.log('Step 1: Establishing trustline...');
  const distributorAccount = await server.loadAccount(distributor.publicKey());
  const trustTx = new TransactionBuilder(distributorAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: testAsset }))
    .setTimeout(30)
    .build();
  trustTx.sign(distributor);
  await server.submitTransaction(trustTx);
  console.log('Trustline established.\n');

  // Step 2: Issuer sends LMFT to distributor
  console.log('Step 2: Issuing tokens to distributor...');
  const issuerAccount = await server.loadAccount(issuer.publicKey());
  const issueTx = new TransactionBuilder(issuerAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: distributor.publicKey(),
        asset: testAsset,
        amount: ISSUE_AMOUNT,
      }),
    )
    .setTimeout(30)
    .build();
  issueTx.sign(issuer);
  await server.submitTransaction(issueTx);
  console.log(`Issued ${ISSUE_AMOUNT} ${TEST_ASSET_CODE} to distributor.\n`);

  // Step 3: Distributor creates a sell offer (sell LMFT, buy XLM)
  console.log('Step 3: Creating sell offer...');
  const distributorAccount2 = await server.loadAccount(distributor.publicKey());
  const offerTx = new TransactionBuilder(distributorAccount2, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageSellOffer({
        selling: testAsset,
        buying: Asset.native(),
        amount: OFFER_SELL_AMOUNT,
        price: OFFER_PRICE,
        offerId: 0,
      }),
    )
    .setTimeout(30)
    .build();
  offerTx.sign(distributor);
  await server.submitTransaction(offerTx);
  console.log(`Created offer: sell ${OFFER_SELL_AMOUNT} LMFT @ ${OFFER_PRICE} XLM each.\n`);

  console.log('Testnet liquidity seeded successfully!');
  console.log(`XLM <-> ${TEST_ASSET_CODE} swaps should now work on Testnet.`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
