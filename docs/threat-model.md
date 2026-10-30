# LumenFlow Threat Model and Security Architecture

## 1. Executive Summary

LumenFlow provides a non-custodial gateway for asset swaps on Stellar, cross-chain bridging via third-party bridges, and fiat offramping via licensed anchor partners. 

Security in LumenFlow is designed around defense-in-depth principles:
- **Zero custody of user funds or private keys**: All on-chain transactions are signed directly in user wallets.
- **Fail-safe boundaries**: All third-party interactions (anchors, bridges, payout rails) are decoupled behind adapter interfaces with kill switches, circuit breakers, and rate caps.
- **Strict cryptographic verification**: Webhook signatures, signed transaction envelopes, and wallet challenges enforce authenticity and non-repudiation.

---

## 2. System Architecture & Trust Boundaries

```
[ User Browser / Local Wallet ]
       │  (Signs XDR locally via Stellar Wallets Kit)
═══════╪══════════════════════════════════════════════════════════ Trust Boundary 1 (Non-Custodial)
       ▼  (HTTPS / TLS 1.3 / Strict CORS / Rate Limited)
[ Next.js Web App / Reverse Proxy ]
       │
═══════╪══════════════════════════════════════════════════════════ Trust Boundary 2 (API Gateway)
       ▼
[ NestJS API Gateway ]
       ├── Auth (SEP-10 challenge & verification, short-lived JWTs)
       ├── Swap Engine (Path payments, route estimation, quote locks)
       ├── Bridge Controller (Safeguards: kill-switches, volume caps)
       ├── Offramp Controller (SEP-12 KYC tiers, SEP-24 interactive URLs)
       └── Webhook Ingestion (HMAC-SHA256 signature & replay defense)
       │
═══════╪══════════════════════════════════════════════════════════ Trust Boundary 3 (Data & Messaging)
       ├── PostgreSQL (Append-only state machine transition events)
       ├── Redis (Distributed rate-limiting, short-lived quote cache)
       └── BullMQ Worker (Bridge status polling, webhook retries, reconciliation)
       │
═══════╪══════════════════════════════════════════════════════════ Trust Boundary 4 (External Providers)
       ├── Stellar Horizon & RPC Nodes (Public network)
       ├── Cross-Chain Bridge Providers (External APIs)
       ├── Anchor Platform SEP-24 / SEP-10 Servers (External services)
       └── Banking & Mobile Money Payout Rails (External settlement)
```

---

## 3. Core Threat Vectors & Mitigations

### 3.1 Non-Custodial Boundary Compromise

* **Threat**: A compromised API or database could attempt to drain user funds or forge unauthorized transfers.
* **Impact**: Total loss of user funds if custody was held server-side.
* **Boundary Analysis**: LumenFlow backend never requests, handles, or stores user private keys or seed phrases. All transaction construction produces **unsigned XDR transactions** (Stellar operations such as `pathPaymentStrictSend`, `changeTrust`).
* **Mitigations**:
  1. Transaction envelopes are returned to the client browser unsigned.
  2. The user signs explicitly inside their hardware or browser extension wallet (Freighter, xBull, Albedo).
  3. Destination address and maximum slippage bounds (`destMin` / `sendMax`) are cryptographically sealed in the transaction operations; modifying them invalidates the wallet signature upon Stellar Horizon ledger ingestion.

### 3.2 Webhook Spoofing

* **Threat**: An adversary crafts malicious HTTP POST requests to `/webhooks/bridge`, `/webhooks/anchor`, or `/webhooks/payout` declaring orders completed or funded when no funds were transferred.
* **Impact**: Fraudulent order progression, premature fiat release, or ledger balance inflation.
* **Mitigations**:
  1. **HMAC-SHA256 Signatures**: Every incoming webhook must include a valid `x-webhook-signature` or `x-signature` header computed using a pre-shared `WEBHOOK_SIGNING_SECRET`.
  2. **Timing-Safe Equality**: Signatures are compared using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
  3. **Schema Validation**: Payloads are strictly validated with Zod schemas (`AnchorWebhookPayloadSchema`, `BridgeWebhookPayloadSchema`, `PayoutWebhookPayloadSchema`) before processing.
  4. **Production Safeguard**: If `NODE_ENV === 'production'`, the server verifies that non-default secrets are configured and halts startup if default secrets remain.

### 3.3 Webhook Replay Attacks

* **Threat**: An attacker intercepts a legitimate, signed webhook payload and replays it multiple times to trigger duplicate payouts or state changes.
* **Impact**: Double payouts, erroneous state rollback, or worker resource exhaustion.
* **Mitigations**:
  1. **Timestamp Drift Tolerance**: Webhook headers (`x-webhook-timestamp`) are evaluated; requests with timestamps older or drifted by more than 300 seconds (5 minutes) are rejected.
  2. **Event Deduplication**: Every event has a unique `eventId` and `provider`. The `WebhooksService` logs processed events in an append-only `WebhookEvent` database table and in-memory/Redis idempotency set. Duplicate deliveries return HTTP 200 `{ received: true, idempotent: true }` without triggering side-effects.
  3. **Strict State Machine**: The order state machine only permits monotonic forward transitions (`CREATED` → `QUOTED` → `AWAITING_SIGNATURE` → `SUBMITTED` → `PROCESSING` → `COMPLETED`). A replayed `COMPLETED` webhook cannot re-trigger an order already in `COMPLETED`.

### 3.4 Quote Manipulation & Front-Running

* **Threat**: A malicious user tampers with the exchange rate, source amount, or slippage tolerance in order creation requests, or exploits outdated prices during volatile market conditions.
* **Impact**: Economic loss for liquidity providers or platform deficit.
* **Mitigations**:
  1. **Server-Generated Quotes**: Quotes are calculated server-side against live order-book depth and liquidity pools; clients cannot submit arbitrary rates.
  2. **Cryptographic Quote Identifiers**: Quotes have unique UUIDs stored in Redis and PostgreSQL with strict expiration windows (30 seconds for swaps, 600 seconds for offramps).
  3. **Server-Side Build Verification**: When `/swap/build` or `/offramp/orders` is called, the quote ID is validated. Expired quotes are rejected immediately with `VALIDATION_ERROR` (code: quote expired).
  4. **On-Chain Enforcement**: Stellar path payment operations specify minimum destination amounts (`destMin`); if price slips beyond the agreed tolerance during submission, the transaction fails on-ledger.

### 3.5 Double-Submission & Concurrent Requests

* **Threat**: Rapid successive submissions of the same order or transaction (network retry race or malicious rapid clicks) resulting in duplicate orders or double spend.
* **Impact**: Duplicate blockchain submissions or parallel worker processing.
* **Mitigations**:
  1. **Idempotency Keys**: API mutating endpoints support the `Idempotency-Key` header handled by `IdempotencyInterceptor`. Concurrent requests with the same key receive cached results.
  2. **Database Transactions**: State transitions utilize PostgreSQL transactions (`prisma.$transaction`) with row locking and append-only audit event ledgers.
  3. **Stellar Sequence Numbers**: On Stellar, each account transaction consumes a sequence number. Even if duplicate signed XDRs are broadcast, Stellar Horizon rejects the second as `tx_bad_seq`.

### 3.6 Bridge and External Provider Outages

* **Threat**: An integrated bridge adapter, partner anchor, or fiat payout rail suffers downtime, network partitioning, or liquidity crisis while user funds are in transit.
* **Impact**: Stuck funds, user frustration, degraded trust.
* **Mitigations**:
  1. **Decoupled Asynchronous Workers**: BullMQ queues (`bridge-status`, `payout-followup`, `webhook-retries`) poll and retry external services with exponential backoff and jitter.
  2. **Operator Kill Switches**: Safeguard endpoints allow instant pausing of individual routes (`stellar-eth-usdc`) or entire providers (`MockBridge`) without service restarts.
  3. **Per-Route Volume Caps**: Configurable minimum and maximum transfer limits prevent sudden liquidity drains.
  4. **Stuck Transfer Alerting**: If a bridge transfer remains pending beyond the SLA (e.g. 30 minutes), worker raises automated alerts via Sentry and Prometheus (`lumenflow_stuck_transfers_count > 0`).
  5. **Automated Reconciliation**: Periodic reconciliation jobs cross-check internal database states against external bank statements and on-chain records, identifying discrepancies immediately.

### 3.7 Operator Key Handling (Production Guidance)

* **Current Architecture**: The application operates in non-custodial testnet mode. Developer fallback seeds are isolated to test environments.
* **Production Key Requirements (Not Implemented in Repository)**:
  For any operator-managed keys (e.g. SEP-10 server signing keys, administrative automated hot wallets, anchor disbursement keys):
  1. **No Plaintext Storage**: Plaintext private keys, seed phrases, or Ed25519 seeds must never be stored in source code, configuration files, or database rows.
  2. **Hardware Security Modules (HSM) / Cloud KMS**:
     - Key generation and transaction signing should occur inside an HSM (e.g. AWS CloudHSM, Google Cloud HSM) or Cloud KMS (AWS KMS, GCP KMS).
     - The application requests signatures via authenticated IAM API calls; the private key never leaves the secure hardware enclave.
  3. **Multi-Party Computation (MPC)**:
     - For high-value administrative accounts or escrow authorities, multi-party computation (e.g. Fireblocks, Fordefi, or Turnkey) should be employed to require M-of-N threshold signatures before transactions can be broadcast.
  4. **Strict Separation of Privilege**:
     - The SEP-10 challenge signing key (which only signs non-payment data operations) must be strictly isolated from any operational balance accounts.

---

## 4. Threat Matrix & Severity Assessment

| Threat Vector | Pre-Mitigation Risk | Mitigation Mechanism | Post-Mitigation Risk |
|---|---|---|---|
| User Key Compromise via App | Critical | Pure non-custodial model; zero key ingestion | Negligible |
| Webhook Forgery | High | HMAC-SHA256 with timing-safe comparison | Low |
| Webhook Replay | High | Event deduplication + 300s timestamp window | Low |
| Quote Rate Manipulation | High | Server-side quotes + Redis TTL + on-chain `destMin` | Low |
| Concurrent Double-Submit | Medium | IdempotencyInterceptor + DB row-level transactions | Negligible |
| Provider / Bridge Outage | High | Kill switches + per-route caps + stuck alerts | Medium |
| Malicious Safeguard Tampering | High | Admin API authentication (`AdminAuthGuard`) | Low |
| API Brute Force / DoS | Medium | Strict rate limiting (`@nestjs/throttler` + Redis) | Low |
| Data Infiltration via CORS | Medium | Whitelisted origin verification (no wildcard credentials) | Negligible |
