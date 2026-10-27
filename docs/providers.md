# Provider Integration Guide

This document describes how external services (KYC, payouts, and cross-chain bridges) integrate into LumenFlow via standardized, vendor-agnostic adapter interfaces.

---

## 1. Non-Custodial Architecture & Adapter Pattern

In alignment with LumenFlow's core design principles:
- **No private keys:** LumenFlow never handles, stores, or transmits user private keys.
- **Provider Agnostic:** All external counterparties (Identity providers, local bank rails, bridge providers) sit behind TypeScript interfaces.
- **Testing & Isolation:** Unit and integration tests rely exclusively on mock implementations (`MockKycAdapter`, `MockPayoutAdapter`, `MockBridgeAdapter`). Real vendor SDKs and live API credentials must never be committed to source control.

---

## 2. KYC / AML Adapters (`KycAdapter`)

### Interface
```ts
export interface KycAdapter {
  readonly name: string;
  getCustomerStatus(userId: string): Promise<KycCustomer>;
  submitVerification(userId: string, data: Record<string, unknown>): Promise<KycCustomer>;
}
```

### Supported KYC Tiers & Limits
Tiered transaction and daily limits are enforced prior to offramp order creation:
- **Tier 0 (Unverified):** Up to $50 single transaction, $100 daily volume.
- **Tier 1 (Basic Info / Phone / BVN / NIN):** Up to $500 single transaction, $1,500 daily volume.
- **Tier 2 (Government ID / Passport / Driver's License):** Up to $3,000 single transaction, $10,000 daily volume.
- **Tier 3 (Enhanced Verification / Proof of Address):** Up to $25,000 single transaction, $100,000 daily volume.

### Planned Vendors (TODOs)
- **Smile ID (`SmileIdKycAdapter`)**
  - *Target Region:* Pan-African (Nigeria, Kenya, Ghana, South Africa).
  - *Capabilities:* Document verification, selfie biometrics, BVN/NIN verification.
  - *TODO:*
    - [ ] Sign commercial agreement and secure sandbox API credentials.
    - [ ] Implement `SmileIdKycAdapter` in `packages/anchor-client` wrapping Smile ID v2 REST API.
    - [ ] Configure webhook callback handler to receive asynchronous document review decisions.
- **Sumsub (`SumsubKycAdapter`)**
  - *Target Region:* Global / Europe / LatAm.
  - *TODO:*
    - [ ] Implement SDK web-embed token generation for L2 identity documents.

---

## 3. Payout Rails (`PayoutAdapter`)

### Interface
```ts
export interface PayoutAdapter {
  readonly name: string;
  initiatePayout(params: PayoutParams): Promise<PayoutResult>;
  getPayoutStatus(payoutId: string): Promise<PayoutResult>;
}
```

### Planned Vendors (TODOs)
- **Paystack (`PaystackPayoutAdapter`)**
  - *Target Region:* Nigeria (NGN), Ghana (GHS).
  - *Capabilities:* NIP instant bank transfers, Mobile Money.
  - *TODO:*
    - [ ] Register institutional corporate account for Transfers API.
    - [ ] Implement recipient resolution (`/transferrecipient`) and dispatch (`/transfer`).
    - [ ] Implement HMAC-SHA512 webhook verification on `transfer.success` and `transfer.failed`.
- **Flutterwave (`FlutterwavePayoutAdapter`)**
  - *Target Region:* Multi-currency African corridors (NGN, KES, UGX, ZAR).
  - *TODO:*
    - [ ] Implement `FlutterwavePayoutAdapter` with idempotent retry headers.
    - [ ] Configure automated balance top-up alerting.

---

## 4. Cross-Chain Bridge Providers (`BridgeAdapter`)

### Interface
```ts
export interface BridgeAdapter {
  name: string;
  getSupportedRoutes(): Promise<BridgeRoute[]>;
  getQuote(params: QuoteParams): Promise<BridgeQuote>;
  buildTransfer(quote: BridgeQuote, sender: string): Promise<UnsignedTransfer>;
  getStatus(transferId: string): Promise<TransferStatus>;
}
```

### Evaluation Criteria
When adding a third-party bridge provider, evaluate and score against:
1. **Supported Chains & Assets:** Must offer native asset settlement or audited wrapped representations. *Note: Do not claim or assume that any real provider currently supports Stellar mainnet until formally verified and audited.*
2. **Security Track Record:** Prior audit reports (minimum 2 independent tier-1 firms), proof of bug bounty program, and time-tested TVL without bridge contract compromises.
3. **Fees & Liquidity:** Low protocol fees and sufficient destination liquidity pool depth to prevent severe slippage.
4. **Settlement Speed & Finality:** Deterministic settlement times (target < 15 minutes) with programmatic status tracking.
5. **API Stability & Support:** Guaranteed SLA, webhook callback reliability, and robust SDK maintenance.

### Provider Integration Checklist
- [ ] Implement `BridgeAdapter` interface in `packages/bridge-adapters/src/providers/`.
- [ ] Add route configurations and transfer limits to the `BridgeAdapterRegistry`.
- [ ] Provide test suite verifying quote generation, unsigned transaction output, and status polling.
- [ ] Configure per-route kill switches in the database/API before activating in production.
