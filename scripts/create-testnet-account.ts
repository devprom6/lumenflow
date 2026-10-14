#!/usr/bin/env ts-node
/**
 * scripts/create-testnet-account.ts
 *
 * Generates a new Stellar keypair and funds it via Friendbot on Testnet.
 * Prints the public key and secret key to stdout.
 *
 * Usage:
 *   pnpm scripts:create-testnet-account
 *   (or: ts-node scripts/create-testnet-account.ts)
 *
 * SECURITY: Secret keys printed here are for TESTNET development only.
 * Never use this script to generate mainnet keys.
 * Never commit the output.
 */

import { Keypair } from '@stellar/stellar-sdk';

async function main(): Promise<void> {
  // Enforce testnet-only
  const network = (process.env['STELLAR_NETWORK'] ?? 'TESTNET').toUpperCase();
  if (network === 'PUBLIC' || network === 'MAINNET') {
    console.error('ERROR: This script must only be used on Testnet.');
    process.exit(1);
  }

  const horizonUrl =
    process.env['STELLAR_HORIZON_URL'] ?? 'https://horizon-testnet.stellar.org';
  const friendbotUrl = `https://friendbot.stellar.org`;

  console.log('Generating Stellar keypair (TESTNET only)...');
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  console.log('\n=== TESTNET KEYPAIR (do not use on mainnet) ===');
  console.log(`Public Key : ${publicKey}`);
  console.log(`Secret Key : ${secretKey}`);
  console.log('==============================================\n');

  console.log('Funding via Friendbot...');
  const response = await fetch(`${friendbotUrl}?addr=${publicKey}`);

  if (!response.ok) {
    const body = await response.text();
    console.error(`Friendbot failed (${response.status}): ${body}`);
    process.exit(1);
  }

  const data = (await response.json()) as { hash?: string };
  console.log(`Funded! Transaction hash: ${data.hash ?? 'unknown'}`);
  console.log(`\nView on Stellar Expert (Testnet):`);
  console.log(`  https://testnet.stellar.expert/explorer/testnet/account/${publicKey}`);
  console.log(`\nHorizon endpoint: ${horizonUrl}/accounts/${publicKey}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
