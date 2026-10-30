# Runbook: Webhook Replay & Duplicate Ingestion Triage

> **Severity**: Medium (P3) to High (P2)  
> **Service**: `apps/api` (`WebhooksController`, `WebhooksService`)  
> **Threat Reference**: `docs/threat-model.md` Section 3 (Webhook Replay & Idempotency)

---

## 1. Overview & Symptoms

LumenFlow receives asynchronous webhooks from bridge networks, Stellar Anchors, and payout rails to confirm order settlement. In high-traffic or network-unstable conditions, providers may retry webhook requests multiple times, or an attacker may attempt to replay previously intercepted webhook payloads to double-credit orders.

### Symptoms
- API logs show repeated messages:
  `[WebhooksService] Duplicate <provider> webhook ignored: event <eventId>`
- API rate limiting alarms triggered on `/webhooks/*` endpoints.
- Prometheus counter `lumenflow_webhook_duplicates_total` increasing rapidly.

---

## 2. Technical Safeguards Verification

Ensure LumenFlow's built-in defenses are active:

### 1. Timing-Safe HMAC Signature Check
All webhook endpoints verify HMAC signatures in constant time:
```typescript
crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
```
If signatures do not match, the request is immediately rejected with HTTP 401.

### 2. Timestamp Drift Validation
The webhook timestamp is verified to prevent delayed replays:
```typescript
const driftSeconds = Math.abs(Date.now() - timestampMs) / 1000;
if (driftSeconds > 300) {
  throw new UnauthorizedException('Timestamp drift exceeds tolerance window');
}
```
Payloads older than 300 seconds are unconditionally rejected.

### 3. Unique Database Constraint Idempotency
Every processed webhook event is inserted into the `WebhookEvent` table with a unique composite key `(provider, eventId)`:
```prisma
model WebhookEvent {
  id        String   @id @default(uuid())
  provider  String
  eventId   String
  @@unique([provider, eventId])
}
```
Duplicate delivery attempts are identified immediately and returned with HTTP 200 without executing side effects.

---

## 3. Triage & Investigation Steps

### Step 1: Check Ingestion Logs
Inspect recent duplicate webhook events:

```bash
# In production log aggregator (e.g. Datadog, CloudWatch, or local journalctl)
journalctl -u lumenflow-api | grep "Duplicate"
```

### Step 2: Query the Database for the Duplicate Event
Verify the original event's processing timestamp and status:

```sql
SELECT id, provider, "eventId", "eventType", processed, "processedAt", "createdAt"
FROM "WebhookEvent"
WHERE "eventId" = '<EVENT_ID>';
```

### Step 3: Check Order Status
Ensure the associated order was NOT mutated twice:

```sql
SELECT "fromStatus", "toStatus", reason, "createdAt"
FROM "OrderEvent"
WHERE metadata->>'webhookEventId' = '<EVENT_ID>';
```
There should be exactly **one** transition corresponding to the original event.

---

## 4. Remediation Actions

### Case A: Benign Provider Retries (HTTP 200 returned)
- **Cause**: Network lag caused provider's first HTTP request to time out after LumenFlow committed the transaction.
- **Action**: No action required. LumenFlow returned HTTP 200 with `{ received: true, duplicate: true }`, acknowledging delivery without re-executing logic.

### Case B: Malicious Webhook Flooding (Different IP, repeated payloads)
- **Cause**: Attacker re-transmitting captured historical webhook payloads.
- **Action**:
  1. The 300-second timestamp drift check will reject stale payloads with HTTP 401.
  2. If the request volume causes CPU or rate-limit saturation, block the offending IP address in Cloudflare / AWS WAF / Nginx reverse proxy.
  3. Rotate `WEBHOOK_SIGNING_SECRET` if signature leakage is suspected.
