# Runbook: Provider & Bridge Outage Response

> **Severity**: Critical (P1)  
> **Service**: `apps/api`, `@lumenflow/bridge-adapters`, `@lumenflow/anchor-client`  
> **Associated Alerts**: `LumenFlowBridgeTransferFailuresHigh`, `LumenFlowQuoteLatencyHigh`

---

## 1. Overview & Triggers

This runbook guides operators through handling an outage of an upstream counterparty (e.g., cross-chain bridge protocol, fiat anchor, or Horizon RPC node).

### Trigger Criteria:
- Upstream provider status page indicates major incident / halted contracts.
- Adapter health check `isHealthy()` fails consistently.
- Bridge transfer failures exceed 5% over a 5-minute evaluation window.
- Urgent security vulnerability disclosure on a supported bridge contract.

---

## 2. Immediate Containment: Emergency Safeguards

LumenFlow provides administrative endpoints protected by `AdminAuthGuard` (`x-admin-key`) to disable affected providers and routes in real time without restarting backend services.

### Action 1: Activate Route Kill-Switch

Disable the affected provider immediately:

```bash
curl -X POST http://localhost:4000/bridge/safeguards/kill-switch \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -d '{
    "providerId": "mock-bridge-1",
    "enabled": false,
    "reason": "Upstream bridge outage reported by provider operations"
  }'
```

**Expected Response (`HTTP 200`)**:
```json
{
  "providerId": "mock-bridge-1",
  "enabled": false,
  "updatedAt": "2026-10-30T10:00:00.000Z"
}
```

Once disabled:
- The registry will omit this provider when generating quotes.
- Active orders targeting this provider will not accept new deposits.
- The web UI will display routes as temporarily unavailable or route traffic to healthy fallback adapters.

---

### Action 2: Lower Per-Transfer Volume Caps (If Partial Degradation)

If a route is experiencing reduced liquidity rather than a complete shutdown, restrict max allowable transfer volume:

```bash
curl -X POST http://localhost:4000/bridge/safeguards/limits \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -d '{
    "sourceChain": "ethereum",
    "destinationChain": "stellar",
    "sourceAsset": "USDC",
    "destinationAsset": "USDC",
    "maxAmount": "500.00"
  }'
```

---

## 3. In-Flight Order Management

Query orders currently in `PROCESSING` that used the degraded provider:

```sql
SELECT id, "userId", status, "sourceAmount", "stellarTxHash", "createdAt"
FROM "Order"
WHERE status = 'PROCESSING'
  AND type = 'BRIDGE'
  AND "createdAt" > NOW() - INTERVAL '6 hours';
```

For each affected order:
1. Contact provider support with transfer IDs.
2. If funds never left the source chain, notify the user.
3. If deposit confirmed on source but destination is stuck due to paused contracts, place a hold on the order and monitor until contracts unpause.

---

## 4. Post-Incident Recovery & Re-activation

Once the provider confirms full operational recovery:

1. **Verify Health**: Test provider API endpoint and mock transfer on testnet:
   ```bash
   curl -s http://localhost:4000/health | jq .
   ```
2. **Re-activate Kill-Switch**:
   ```bash
   curl -X POST http://localhost:4000/bridge/safeguards/kill-switch \
     -H "Content-Type: application/json" \
     -H "x-admin-key: $ADMIN_API_KEY" \
     -d '{
       "providerId": "mock-bridge-1",
       "enabled": true,
       "reason": "Upstream provider confirmed full resolution"
     }'
   ```
3. **Verify Route Restoration**:
   Check that quotes are returned successfully via `POST /bridge/quote`.
4. **Publish Post-Mortem**: Document downtime duration, impact, and root cause in incident log.
