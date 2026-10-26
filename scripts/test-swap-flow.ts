#!/usr/bin/env ts-node
/**
 * scripts/test-swap-flow.ts
 *
 * Day 3 Exit Gate Verification Script.
 * Executes the scripted non-custodial flow against the running dev stack:
 *   1. SEP-10 Challenge (/auth/challenge)
 *   2. Local ed25519 wallet signing (Server never sees secret key)
 *   3. SEP-10 Verify & JWT session (/auth/verify)
 *   4. Request Swap Quote (/swap/quote)
 *   5. Build Unsigned Transaction (/swap/build)
 *   6. Local transaction signing via client keypair
 *   7. Submit Signed Transaction (/swap/submit)
 *   8. Audit Trail Verification (/orders/:id)
 *
 * Usage:
 *   node --experimental-strip-types scripts/test-swap-flow.ts
 *   or: pnpm scripts:test-swap-flow
 */

import { Keypair, Transaction, Networks } from '@stellar/stellar-sdk';

const API_BASE_URL = process.env['API_URL'] ?? 'http://localhost:4000';

async function executeFlow(baseUrl: string): Promise<void> {
  console.log('\n[Step 1] Initializing client keypair (non-custodial)...');
  const clientKeypair = Keypair.random();
  console.log(`Client Public Key: ${clientKeypair.publicKey()}`);

  console.log('\n[Step 2] Requesting SEP-10 challenge from API...');
  const challengeRes = await fetch(`${baseUrl}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: clientKeypair.publicKey() }),
  });

  if (!challengeRes.ok) {
    throw new Error(`Challenge request failed (${challengeRes.status}): ${await challengeRes.text()}`);
  }

  const challenge = (await challengeRes.json()) as {
    transaction: string;
    networkPassphrase: string;
  };
  console.log('Received unsigned SEP-10 challenge XDR.');

  console.log('\n[Step 3] Signing challenge locally (private key remains on client)...');
  const challengeTx = new Transaction(
    challenge.transaction,
    challenge.networkPassphrase ?? Networks.TESTNET,
  );
  challengeTx.sign(clientKeypair);
  const signedChallengeXdr = challengeTx.toXDR();

  console.log('\n[Step 4] Verifying challenge and obtaining session JWT...');
  const verifyRes = await fetch(`${baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedChallengeXdr }),
  });

  if (!verifyRes.ok) {
    throw new Error(`Verification failed (${verifyRes.status}): ${await verifyRes.text()}`);
  }

  const authData = (await verifyRes.json()) as {
    token: string;
    user: { id: string; publicKey: string };
  };
  console.log(`Authenticated! User ID: ${authData.user.id}`);
  console.log(`JWT: ${authData.token.substring(0, 20)}...`);

  console.log('\n[Step 5] Requesting swap quote (XLM -> USDC)...');
  const quoteRes = await fetch(`${baseUrl}/swap/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.token}`,
    },
    body: JSON.stringify({
      sourceAsset: { type: 'native', code: 'XLM' },
      destinationAsset: {
        type: 'credit_alphanum4',
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      },
      sourceAmount: '50.0000000',
      slippageTolerance: 0.01,
    }),
  });

  if (!quoteRes.ok) {
    throw new Error(`Quote failed (${quoteRes.status}): ${await quoteRes.text()}`);
  }

  const quote = (await quoteRes.json()) as {
    id: string;
    destinationAmount: string;
    minimumReceived: string;
    priceImpact: number;
    expiresAt: string;
  };
  console.log(`Quote Received ID: ${quote.id}`);
  console.log(`Expected Output : ${quote.destinationAmount} USDC`);
  console.log(`Price Impact    : ${(quote.priceImpact * 100).toFixed(2)}%`);
  console.log(`Expires At      : ${quote.expiresAt}`);

  console.log('\n[Step 6] Building unsigned swap transaction...');
  const buildRes = await fetch(`${baseUrl}/swap/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.token}`,
    },
    body: JSON.stringify({
      quoteId: quote.id,
      senderPublicKey: clientKeypair.publicKey(),
    }),
  });

  if (!buildRes.ok) {
    throw new Error(`Build transaction failed (${buildRes.status}): ${await buildRes.text()}`);
  }

  const buildData = (await buildRes.json()) as {
    unsignedXdr: string;
    orderId: string;
    networkPassphrase: string;
    addedTrustline: boolean;
  };
  console.log(`Order ID: ${buildData.orderId}`);
  console.log(`Includes trustline op: ${buildData.addedTrustline}`);
  console.log(`Unsigned XDR: ${buildData.unsignedXdr.substring(0, 40)}...`);

  console.log('\n[Step 7] Client wallet signs the swap transaction locally...');
  const swapTx = new Transaction(
    buildData.unsignedXdr,
    buildData.networkPassphrase ?? Networks.TESTNET,
  );
  swapTx.sign(clientKeypair);
  const signedSwapXdr = swapTx.toXDR();

  console.log('\n[Step 8] Submitting signed transaction to /swap/submit...');
  const submitRes = await fetch(`${baseUrl}/swap/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.token}`,
    },
    body: JSON.stringify({
      orderId: buildData.orderId,
      signedXdr: signedSwapXdr,
    }),
  });

  if (!submitRes.ok) {
    throw new Error(`Submit failed (${submitRes.status}): ${await submitRes.text()}`);
  }

  const submitData = (await submitRes.json()) as {
    orderId: string;
    status: string;
    stellarTxHash: string;
  };
  console.log(`Swap submitted successfully!`);
  console.log(`Order Status    : ${submitData.status}`);
  console.log(`Stellar TX Hash : ${submitData.stellarTxHash}`);

  console.log('\n[Step 9] Inspecting append-only order_events audit trail...');
  const orderRes = await fetch(`${baseUrl}/orders/${buildData.orderId}`, {
    headers: { Authorization: `Bearer ${authData.token}` },
  });

  if (!orderRes.ok) {
    throw new Error(`Failed to fetch order: ${await orderRes.text()}`);
  }

  const order = (await orderRes.json()) as {
    id: string;
    status: string;
    events: Array<{
      id: string;
      fromStatus: string;
      toStatus: string;
      createdAt: string;
    }>;
  };

  console.log(`\n======================================================`);
  console.log(`ORDER AUDIT TRAIL FOR ORDER: ${order.id}`);
  console.log(`Final Order Status: ${order.status}`);
  console.log(`Total Events Logged: ${order.events.length}`);
  console.log(`======================================================`);

  order.events.forEach((event, idx) => {
    console.log(
      `  [#${idx + 1}] ${event.createdAt} | Transition: ${event.fromStatus} -> ${event.toStatus}`,
    );
  });
  console.log(`======================================================\n`);

  console.log('>>> Day 3 Exit Gate Verification PASSED! <<<');
}

async function main(): Promise<void> {
  console.log('=== LumenFlow Swap Flow Verification Script ===');
  console.log(`Connecting to LumenFlow API at ${API_BASE_URL}...`);

  try {
    const health = await fetch(`${API_BASE_URL}/health`);
    if (!health.ok) {
      throw new Error(`Health check returned HTTP ${health.status}`);
    }
  } catch (err: unknown) {
    console.error(
      `\nError: API server is not accessible at ${API_BASE_URL}.\n` +
      `Please ensure the API server is running ('pnpm --filter @lumenflow/api start').\n` +
      `Details: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  await executeFlow(API_BASE_URL);
}

main().catch((err) => {
  console.error('\nERROR: Swap flow test failed:\n', err);
  process.exit(1);
});
