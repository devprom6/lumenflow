# Non-Custodial Wallet Testing Guide

LumenFlow is non-custodial by design. Neither the API server nor the web application ever request, see, store, or transmit a user's private key.

This document describes how wallet connection, SEP-10 authentication, and transaction signing are implemented and tested across unit, component, and Playwright end-to-end test suites.

---

## 1. Core Principles

1. **Unsigned Transactions Only**: The backend API builds unsigned transaction XDRs and sends them to the client. The client requests the user's wallet to sign the XDR.
2. **Local ed25519 Signatures**: Cryptographic signing occurs strictly inside the user's wallet environment (browser extension or delegated web signer). The client application sends only the resulting user-signed XDR to `/swap/submit`.
3. **SEP-10 Identity Verification**: Authentication uses SEP-10 challenge transactions. The server generates an unsigned challenge containing a random nonce and timebounds. The user's wallet signs the challenge with their ed25519 key, and the server validates the signature against the user's public key before issuing a short-lived JWT.
4. **Testnet Only**: All configurations, horizon endpoints, and network passphrases target Stellar Testnet (`Test SDF Network ; September 2015`).

---

## 2. Supported Wallets

LumenFlow integrates with the Stellar ecosystem through **Stellar Wallets Kit** (`@creit.tech/stellar-wallets-kit`):

| Wallet | Type | Signing Mechanism |
|---|---|---|
| **Freighter** | Browser Extension | In-extension popup signing via `@stellar/freighter-api` |
| **xBull** | Extension / Web | Window postMessage / extension bridge |
| **Albedo** | Web Signer | Delegated iframe / web redirect signing |
| **Lobstr** | Mobile / Extension | WalletConnect / mobile bridge |
| **Testnet Dev Wallet** | Automated Signer | In-memory ed25519 signer for development & automated E2E tests |

---

## 3. Testing Strategy

### 3.1 Unit Testing (API & Stellar Core)
- **State Machine Transitions**: `OrderStateMachineService` enforces legal state flow:
  `CREATED -> QUOTED -> AWAITING_SIGNATURE -> SUBMITTED -> PROCESSING -> COMPLETED` (with `FAILED`, `EXPIRED`, `REFUNDED` branches).
  All 13 legal transitions and 68 illegal transitions are verified via unit tests.
- **Append-Only Event Ledger**: Every state transition writes an `order_events` row in the same transaction. Runtime guards prevent updates or deletions.
- **SEP-10 Challenge/Verify**: Tested by creating temporary Keypairs, building challenge transactions, signing them with the client keypair, and verifying JWT issuance.

### 3.2 Component Testing (`packages/ui` & `apps/web`)
- **Swap Form States**: Tests input handling, decimal formatting, "Max" balance calculation, asset flipping, and quote rendering.
- **Wallet State Simulation**: Zustand `useWalletStore` state is populated with test public keys to verify connected UI states and pre-signing trustline prompts without live network dependencies.

### 3.3 End-to-End Automated Testing (Playwright)
Testing browser extensions (like Freighter) in automated headless CI is notoriously flaky and prone to timing failures due to extension popup permissions.

To provide 100% deterministic, robust, and fast E2E testing while preserving exact non-custodial parity, LumenFlow implements the **Automated Test Wallet Provider**:

1. **Injection**: In `e2e/swap-journey.spec.ts`, Playwright injects `window.__LUMENFLOW_TEST_WALLET__` before page load via `page.addInitScript()`.
2. **Execution**: When the user clicks "Connect Wallet", `WalletService` detects the test provider and requests the challenge from `/auth/challenge`.
3. **Local Signing**: The test provider signs the challenge locally and returns the signed XDR to the application.
4. **Full Swap Journey**:
   - `connect`: User connects wallet identity.
   - `quote`: Enters amount, receives live quote with route, slippage, and fees.
   - `trustline UX`: When swapping to a non-native asset (e.g. USDC), the plain-language trustline and 0.5 XLM reserve explanation dialog is displayed and accepted.
   - `sign`: Unsigned transaction XDR is built and signed locally.
   - `submit`: Signed XDR is broadcast to Stellar Horizon.
   - `history`: Navigates to `/history` and verifies the completed swap in the audit trail.
5. **Multi-Device Support**: Tests run against both **Desktop Chrome** (1280x720) and **Mobile Chrome** (Pixel 5 viewport) to ensure responsive UX.

---

## 4. Trustline and Reserve UX Testing

When a user swaps into a non-native asset on Stellar (e.g., USDC or EURC), the ledger requires:
1. A `changeTrust` operation establishing a trustline with the issuer.
2. An additional **0.5 XLM reserve** locked on the account.

**Pre-Signing Explanation Requirement**:
Before any wallet signing request is triggered, LumenFlow presents the user with a plain-language explanation modal:
> "To hold and receive USDC on Stellar, an initial trustline is required. Stellar reserves 0.5 XLM of your balance to establish this trustline. This 0.5 XLM is locked on the ledger (not spent) and is automatically unlocked if you close the trustline in the future."

The user must acknowledge this requirement before the wallet is prompted to sign the transaction.

---

## 5. Running Tests

```bash
# Unit & integration tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Scripted Testnet Swap Flow (Day 3 exit gate)
pnpm scripts:test-swap-flow

# Playwright E2E Tests (Day 4 exit gate)
pnpm --filter @lumenflow/web test:e2e
```
