# Runbook: Stuck Bridge Transfer Resolution

> **Severity**: High (P2)  
> **Service**: `@lumenflow/bridge-adapters`, `apps/worker`  
> **Associated Alerts**: `LumenFlowStuckBridgeTransfersHigh`

---

## 1. Overview & Symptoms

A bridge transfer is considered **stuck** when an order has been in the `PROCESSING` state for longer than the route's `estimatedDurationSeconds` plus a safety grace window (typically > 30 minutes) without receiving a terminal confirmation (`SUCCESS` or `FAILED`).

### Symptoms
- Prometheus metric `lumenflow_stuck_transfers_count` $> 0$.
- User reports that assets left source wallet but have not arrived on destination chain.
- Worker log: `[StuckTransfersWatchdog] Order <orderId> has been stuck in PROCESSING for <duration>`.

---

## 2. Immediate Triage Steps

### Step 1: Identify Stuck Orders
Query the PostgreSQL database for stuck bridge orders:

```sql
SELECT o.id, o."userId", o.status, o."sourceAsset", o."destinationAsset", 
       o."sourceAmount", o."destinationAmount", o."stellarTxHash", o."createdAt", o."updatedAt"
FROM "Order" o
WHERE o.status = 'PROCESSING'
  AND o.type = 'BRIDGE'
  AND o."updatedAt" < NOW() - INTERVAL '30 minutes';
```

### Step 2: Check Audit Trail
Inspect the append-only event trail for the order:

```sql
SELECT "fromStatus", "toStatus", reason, metadata, "createdAt"
FROM "OrderEvent"
WHERE "orderId" = '<ORDER_ID>'
ORDER BY "createdAt" ASC;
```

### Step 3: Inspect BullMQ Job Queue
Check BullMQ queue status:
- Worker metrics: `curl http://localhost:9102/metrics | grep lumenflow_worker_queue_depth`
- Check Redis keys: `redis-cli SMEMBERS "bull:bridge-monitor:active"`

### Step 4: Check Cross-Chain Explorer
1. If source chain is Stellar: inspect transaction on Stellar Expert: `https://stellar.expert/explorer/testnet/tx/<stellarTxHash>`
2. If destination chain is EVM/external: inspect the bridge contract address and user's destination wallet.

---

## 3. Root Cause Investigation

| Cause | Indicator | Resolution |
| :--- | :--- | :--- |
| **Gas Spike on Destination Chain** | Deposit confirmed on source, but bridge relayer transaction pending. | Relayer will usually batch once gas normalizes; contact bridge provider support if delayed > 2 hours. |
| **Deposit Memo Missing/Incorrect** | Deposit arrived at bridge custodian account with blank/wrong memo. | Escalate to bridge support with source transaction hash and signed message from user wallet. |
| **Provider API Downtime** | Bridge adapter `getStatus` throwing HTTP 5xx or timing out. | Worker will continue polling with exponential backoff. Do NOT mark failed prematurely. |
| **Transfer Permanently Dropped** | Bridge provider reports transfer dropped or refunded on source. | Transition order to `REFUNDED` via state machine. |

---

## 4. Resolution & State Machine Transition

### Option A: Manual Retry via Worker
If the worker stalled or restarted, re-enqueue the status check job:

```bash
# Push status check job to BullMQ
pnpm --filter worker run trigger:poll --orderId=<ORDER_ID>
```

### Option B: Transition to COMPLETED (Upon Verification)
If destination chain explorer confirms delivery to the user's wallet:

```typescript
// Via OrderStateMachineService
await orderStateMachine.transition(orderId, 'COMPLETED', {
  reason: 'Manual operator confirmation: transfer confirmed on destination chain',
  metadata: { destinationTxHash: '<TX_HASH>', operator: '<OPERATOR_ID>' },
});
```

### Option C: Transition to REFUNDED (Upon Cancellation)
If the bridge provider confirmed failure and returned assets:

```typescript
await orderStateMachine.transition(orderId, 'REFUNDED', {
  reason: 'Bridge transfer canceled by provider: source funds refunded to user',
  metadata: { refundTxHash: '<REFUND_TX_HASH>', operator: '<OPERATOR_ID>' },
});
```

---

## 5. Verification

1. Check that `curl http://localhost:9102/metrics | grep lumenflow_stuck_transfers_count` has decremented.
2. Verify order state is terminal (`COMPLETED` or `REFUNDED`).
3. Notify the user with transaction hash evidence.
