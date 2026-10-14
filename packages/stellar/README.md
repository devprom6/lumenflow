# @lumenflow/stellar

Stellar SDK wrappers, path-payment helpers, trustline management, and unsigned transaction builders for the LumenFlow platform.

## Overview

This package encapsulates all Stellar blockchain interaction. It is used by `@lumenflow/quote-engine` and `apps/api`. It **never** handles or stores user private keys — all transaction building produces **unsigned XDR** that must be signed in the user's wallet.

## API

### Network config

```ts
import { getNetworkConfig } from '@lumenflow/stellar';

const config = getNetworkConfig();
// { network: 'TESTNET', horizonUrl: '...', rpcUrl: '...', networkPassphrase: '...' }
```

Throws if `STELLAR_NETWORK=MAINNET` or `STELLAR_NETWORK=PUBLIC` is set. Testnet only.

### Account helpers

```ts
import { loadAccount, getBalances, hasTrustline, calculateMinimumReserve } from '@lumenflow/stellar';

const account = await loadAccount(publicKey);
const balances = await getBalances(publicKey);
// { 'XLM': '50.0000000', 'USDC:G...': '10.0000000' }

const hasUSDC = await hasTrustline(publicKey, { type: 'credit_alphanum4', code: 'USDC', issuer: 'G...' });

const minReserve = calculateMinimumReserve({ subentryCount: 2 });
// '2.0000000'
```

### Path-finding

```ts
import { findStrictSendPaths, findStrictReceivePaths } from '@lumenflow/stellar';

// Strict-send: send exactly 10 XLM, receive as much USDC as possible
const routes = await findStrictSendPaths({
  sourceAsset: { type: 'native', code: 'XLM' },
  sourceAmount: '10.0000000',
  destinationAsset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'G...' },
});
```

### Building unsigned swap transactions

```ts
import { buildSwapTransaction } from '@lumenflow/stellar';

const { unsignedXdr, addedTrustline } = await buildSwapTransaction({
  senderPublicKey: 'G...',
  sourceAsset: { type: 'native', code: 'XLM' },
  destinationAsset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'G...' },
  sourceAmount: '10.0000000',
  minimumDestinationAmount: '9.7510000', // from quote.minimumReceived
  path: [], // intermediate hops from the quote
});

// addedTrustline === true means a changeTrust op was prepended
// unsignedXdr is the base64 XDR to send to the user's wallet for signing
```

### Submitting a signed transaction

```ts
import { submitTransaction } from '@lumenflow/stellar';

// signedXdr comes from the user's wallet (e.g. Freighter)
const result = await submitTransaction(signedXdr);
// { hash: '...', ledger: 12345, createdAt: '2026-...' }
```

## Full example: quote → unsigned XDR → sign → submit

```ts
import { getSwapQuote } from '@lumenflow/quote-engine';
import { buildSwapTransaction, submitTransaction } from '@lumenflow/stellar';

// 1. Get a quote
const quote = await getSwapQuote({
  sourceAsset: { type: 'native', code: 'XLM' },
  destinationAsset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'G...' },
  sourceAmount: '10.0000000',
  slippageTolerance: 0.005,
});

// 2. Build unsigned XDR (backend)
const { unsignedXdr } = await buildSwapTransaction({
  senderPublicKey: userPublicKey,
  sourceAsset: quote.sourceAsset,
  destinationAsset: quote.destinationAsset,
  sourceAmount: quote.sourceAmount,
  minimumDestinationAmount: quote.minimumReceived,
  path: quote.path.map(h => h.asset),
});

// 3. User signs in their wallet (e.g. Freighter — NOT shown here)
// const signedXdr = await freighter.signTransaction(unsignedXdr, { networkPassphrase });

// 4. Submit signed XDR (backend or client)
// const result = await submitTransaction(signedXdr);
```

## Environment variables

| Variable | Default |
|---|---|
| `STELLAR_NETWORK` | `TESTNET` (set to anything else throws) |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |

## Testing

```bash
pnpm --filter stellar test        # unit tests (mocked Horizon)
pnpm --filter stellar test:watch  # watch mode
```

Integration tests against live Testnet are skipped automatically when the network is unreachable.
