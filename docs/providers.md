# Provider Integration Guide

This guide explains how external counterparties and providers integrate into LumenFlow:
1. **Cross-Chain Bridge Providers** (`BridgeAdapter`)
2. **Stellar Anchors** (SEP-1, SEP-10, SEP-12, SEP-24)
3. **KYC / AML Identity Providers** (`KycAdapter`)
4. **Local Fiat Payout Rails** (`PayoutAdapter`)

---

## 1. Non-Custodial Architecture Principle

In alignment with LumenFlow's core design principles:
- **Zero Custody**: LumenFlow never handles, stores, or transmits user private keys.
- **Provider Agnostic**: All external counterparties (bridges, anchors, banks, KYC vendors) sit behind standardized TypeScript interfaces.
- **Hermetic Testing**: Unit and integration tests rely exclusively on mock implementations (`MockBridgeAdapter`, `MockAnchorServer`, `MockKycAdapter`, `MockPayoutAdapter`). Real vendor credentials must never be committed.

---

## 2. Implementing a Bridge Adapter (`BridgeAdapter`)

Bridge adapters connect external blockchains (Ethereum, Polygon, Arbitrum, Solana) with Stellar.

### Interface Definition (`packages/shared-types`)
```typescript
export interface BridgeAdapter {
  readonly id: string;
  readonly name: string;
  isHealthy(): Promise<boolean>;
  getSupportedRoutes(): Promise<BridgeRoute[]>;
  getQuote(params: BridgeQuoteParams): Promise<BridgeQuote>;
  buildTransfer(params: BridgeTransferParams): Promise<BridgeUnsignedTransfer>;
  getStatus(transferId: string): Promise<BridgeTransferStatus>;
}
```

### Step-by-Step Implementation

1. **Create Adapter File**:
   Create `packages/bridge-adapters/src/adapters/<provider>.adapter.ts`.

2. **Implement Health & Route Discovery**:
   ```typescript
   import {
     type BridgeAdapter,
     type BridgeRoute,
     type BridgeQuoteParams,
     type BridgeQuote,
     type BridgeTransferParams,
     type BridgeUnsignedTransfer,
     type BridgeTransferStatus,
   } from '@lumenflow/shared-types';

   export class CustomBridgeAdapter implements BridgeAdapter {
     readonly id = 'custom-bridge';
     readonly name = 'Custom Bridge Network';

     async isHealthy(): Promise<boolean> {
       try {
         const res = await fetch('https://api.custombridge.io/v1/health');
         return res.ok;
       } catch {
         return false;
       }
     }

     async getSupportedRoutes(): Promise<BridgeRoute[]> {
       return [
         {
           sourceChain: 'ethereum',
           destinationChain: 'stellar',
           sourceAsset: 'USDC',
           destinationAsset: 'USDC',
           estimatedDurationSeconds: 300,
           minAmount: '10.0',
           maxAmount: '50000.0',
         },
       ];
     }

     async getQuote(params: BridgeQuoteParams): Promise<BridgeQuote> {
       const fee = '1.50';
       const destinationAmount = (parseFloat(params.amount) - parseFloat(fee)).toFixed(7);
       return {
         adapterId: this.id,
         route: params.route,
         sourceAmount: params.amount,
         destinationAmount,
         fee,
         estimatedDurationSeconds: 300,
         expiresAt: Math.floor(Date.now() / 1000) + 120,
       };
     }

     async buildTransfer(params: BridgeTransferParams): Promise<BridgeUnsignedTransfer> {
       // Return non-custodial deposit address/memo
       return {
         transferId: `bridge-${Date.now()}`,
         adapterId: this.id,
         depositAddress: '0x1111111111111111111111111111111111111111',
         depositMemo: 'lumenflow-deposit-memo',
         estimatedDurationSeconds: 300,
       };
     }

     async getStatus(transferId: string): Promise<BridgeTransferStatus> {
       const res = await fetch(`https://api.custombridge.io/v1/transfers/${transferId}`);
       const data = await res.json();
       return {
         transferId,
         status: data.status === 'confirmed' ? 'SUCCESS' : 'PENDING',
         txHash: data.txHash,
       };
     }
   }
   ```

3. **Register Adapter**:
   In `packages/bridge-adapters/src/registry.ts`, register the adapter:
   ```typescript
   registry.register(new CustomBridgeAdapter(), 10); // Priority 10
   ```

---

## 3. Integrating an Anchor (SEP-1, SEP-10, SEP-12, SEP-24)

LumenFlow connects to Stellar Anchors using `@lumenflow/anchor-client`.

### Flow Steps:
1. **SEP-1 Discovery**:
   Fetch `/.well-known/stellar.toml` from the anchor domain:
   ```typescript
   const toml = await anchorClient.discoverToml('https://anchor.example.com');
   // Extracts WEB_AUTH_ENDPOINT, TRANSFER_SERVER_SEP0024, KYC_SERVER
   ```
2. **SEP-10 Web Authentication**:
   Authenticate the client's Stellar account:
   ```typescript
   const challenge = await anchorClient.getAuthChallenge(toml.WEB_AUTH_ENDPOINT, publicKey);
   const signedXdr = Sep10Client.signChallengeLocally(challenge.transaction, keypair, network);
   const { token } = await anchorClient.submitAuthChallenge(toml.WEB_AUTH_ENDPOINT, signedXdr);
   ```
3. **SEP-12 KYC Information**:
   Submit or verify customer identity fields:
   ```typescript
   const kyc = await anchorClient.getCustomerKyc(toml.KYC_SERVER, token, { account: publicKey });
   ```
4. **SEP-24 Interactive Flow**:
   Initiate an offramp withdrawal:
   ```typescript
   const withdraw = await anchorClient.initiateWithdraw(toml.TRANSFER_SERVER_SEP0024, token, {
     asset_code: 'USDC',
     account: publicKey,
     amount: '100.00',
   });
   // Render interactive popup: withdraw.url
   // Poll status: anchorClient.getTransaction(toml.TRANSFER_SERVER_SEP0024, token, withdraw.id)
   ```

---

## 4. Implementing a KYC Adapter (`KycAdapter`)

KYC adapters evaluate customer verification tiers before allowing high-volume fiat transactions.

```typescript
export interface KycAdapter {
  readonly name: string;
  getCustomerStatus(userId: string): Promise<KycCustomer>;
  submitVerification(userId: string, data: Record<string, unknown>): Promise<KycCustomer>;
}
```

### Supported KYC Tiers:
- **Tier 0 (Unverified)**: Up to $50 single transaction, $100 daily volume.
- **Tier 1 (Basic Info / Phone / National ID)**: Up to $500 single transaction, $1,500 daily volume.
- **Tier 2 (Government ID / Passport / Biometric)**: Up to $3,000 single transaction, $10,000 daily volume.
- **Tier 3 (Enhanced Verification / Proof of Address)**: Up to $25,000 single transaction, $100,000 daily volume.

---

## 5. Implementing a Payout Adapter (`PayoutAdapter`)

Payout adapters disburse fiat currencies to local bank accounts and mobile money wallets.

```typescript
export interface PayoutAdapter {
  readonly name: string;
  initiatePayout(params: PayoutParams): Promise<PayoutResult>;
  getPayoutStatus(payoutId: string): Promise<PayoutResult>;
}
```

### Critical Requirements for Payout Adapters:
1. **Idempotency**: Always pass an `Idempotency-Key` or `orderId` in requests to prevent duplicate disbursements.
2. **Status Mapping**: Map provider statuses explicitly to `PENDING`, `COMPLETED`, or `FAILED`.
3. **Webhooks**: Verify HMAC signatures using `crypto.timingSafeEqual`.
4. **Reconciliation**: Periodically verify unsettled payouts via `getPayoutStatus`.
