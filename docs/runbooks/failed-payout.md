# Runbook: Failed Payout Resolution

> **Severity**: High (P2)  
> **Service**: `apps/api`, `packages/anchor-client`, `apps/worker`  
> **Associated Alerts**: `LumenFlowOfframpSuccessRateLow`

---

## 1. Overview & Symptoms

A payout failure occurs during an offramp order when on-chain funds have been collected from the user, but the offramp anchor or fiat payout rail fails to disburse local fiat currency (e.g. NGN, EUR, USD) to the user's recipient bank account.

### Symptoms
- Order transitions to `FAILED` status after entering `PROCESSING`.
- Payout webhook received with event `payout.failed` or status `failed`.
- Prometheus metric `lumenflow_offramp_orders_total{status="failed"}` increments.
- User submits a support ticket reporting missing bank transfer.

---

## 2. Immediate Triage Steps

### Step 1: Locate Order & Payout Details
Query the database for the failed order:

```sql
SELECT o.id, o."userId", o.status, o."sourceAmount", o."destinationAmount", 
       o."destinationAsset", o."stellarTxHash", o."updatedAt"
FROM "Order" o
WHERE o.id = '<ORDER_ID>' AND o.type = 'OFFRAMP';
```

### Step 2: Review Audit Event Reason
Fetch the exact error returned by the anchor/payout rail:

```sql
SELECT "fromStatus", "toStatus", reason, metadata, "createdAt"
FROM "OrderEvent"
WHERE "orderId" = '<ORDER_ID>'
ORDER BY "createdAt" DESC
LIMIT 5;
```

Look at the `metadata` JSON field:
- `error`: Payout gateway rejection code (e.g., `ACCOUNT_NAME_MISMATCH`, `INVALID_BANK_CODE`, `INSUFFICIENT_LIQUIDITY`).
- `externalReference`: Provider transaction reference ID.

### Step 3: Check Payout Provider Console
Log in to the respective partner dashboard (Mock Anchor, Flutterwave, Paystack, or SEPA gateway) using the `externalReference` to verify disbursement state.

---

## 3. Common Failure Scenarios & Actions

### Scenario 1: Invalid Banking Details / Name Mismatch
- **Root Cause**: Bank account number does not exist, or KYC name does not match bank account name.
- **Action**:
  1. Do NOT retry blindly (will fail again).
  2. Transition order to `REFUNDED`:
     ```typescript
     await orderStateMachine.transition(orderId, 'REFUNDED', {
       reason: 'Payout rejected: Invalid bank details / name mismatch',
       metadata: { refundMethod: 'STELLAR_ONCHAIN_RETURN' },
     });
     ```
  3. Worker returns the deposited crypto asset (e.g. USDC) minus network transaction fee to user's wallet.

### Scenario 2: Downstream Bank Network Outage (Transient)
- **Root Cause**: Interbank clearing network (e.g., NIP in Nigeria, SEPA Instant in EU) timed out.
- **Action**:
  1. Verify provider did not actually debit funds.
  2. If provider confirmed no debit occurred, retry payout disbursement via the adapter:
     ```typescript
     await payoutAdapter.initiatePayout(params);
     ```
  3. If retry succeeds, transition order back to `COMPLETED`.

### Scenario 3: Provider Liquidity Shortfall
- **Root Cause**: The Anchor or local payout partner ran out of local currency float.
- **Action**:
  1. Notify operations to fund the payout float account.
  2. If float replenishment takes > 1 hour, initiate on-chain refund to the user.

---

## 4. Verification & Post-Mortem

1. Verify order has reached a terminal state (`COMPLETED` or `REFUNDED`).
2. If refunded: confirm on-chain refund transaction hash on Horizon explorer.
3. Update user support ticket with full resolution notes and transaction hash.
