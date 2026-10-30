# LumenFlow Testing Guide

This guide details the testing architecture, standards, test execution commands, and guidelines for writing reliable tests in the LumenFlow codebase.

---

## 1. Testing Philosophy

LumenFlow manages financial transactions across decentralized ledgers and fiat anchors. Software reliability and deterministic behavior are paramount.

- **Zero Tolerance for Flaky Tests**: Tests must avoid arbitrary timeouts (`setTimeout`) and non-deterministic clock drift.
- **High Critical Domain Coverage**: The state machine, quote engine, bridge adapters, and webhook handlers must maintain $\ge 80\%$ test coverage at all times.
- **Isolated Mock Infrastructure**: Tests use `MockAnchorServer`, `MockBridgeAdapter`, and mock Horizon providers rather than relying on live testnets during unit runs.
- **Non-Custodial Assertions**: Tests must verify that private keys never leak into logs, payloads, or server memory.

---

## 2. Test Execution Commands

### Monorepo-Wide Checks
```bash
# Run all unit and integration test suites
pnpm test

# Run TypeScript typechecks across all workspaces
pnpm typecheck

# Run ESLint across all workspaces
pnpm lint

# Check code formatting with Prettier
pnpm format:check
```

### Running Tests per Package
```bash
# Quote Engine tests with coverage
pnpm --filter @lumenflow/quote-engine test -- --coverage

# Bridge Adapters tests with coverage
pnpm --filter @lumenflow/bridge-adapters test -- --coverage

# Anchor Client tests with coverage
pnpm --filter @lumenflow/anchor-client test -- --coverage

# API tests with coverage
pnpm --filter @lumenflow/api test -- --coverage
```

### Running End-to-End (E2E) Tests
Playwright tests are located in `apps/web/e2e/`.

```bash
# Run all E2E tests in headless mode
pnpm --filter @lumenflow/web test:e2e

# Run E2E tests with interactive UI
pnpm --filter @lumenflow/web exec playwright test --ui

# Run a specific spec
pnpm --filter @lumenflow/web exec playwright test swap-journey.spec.ts
```

---

## 3. Test Suites Overview

### Domain Unit Tests

| Workspace | Key Test Files | Scope |
| :--- | :--- | :--- |
| `packages/quote-engine` | `quote-engine.test.ts`<br>`horizon-route-source.test.ts` | Multi-hop route discovery, slippage, liquidity estimation, fee models. |
| `packages/bridge-adapters` | `bridge-adapters.test.ts` | MockBridgeAdapter lifecycle (`SUCCESS`, `PENDING`, `STUCK`, `FAILED`), failovers, kill-switches. |
| `packages/anchor-client` | `anchor-client.test.ts`<br>`anchor-errors.test.ts` | SEP-1 TOML discovery, SEP-10 challenge-response, SEP-12 KYC, SEP-24 interactive flow, HTTP retries. |
| `apps/api` | `order-state-machine.service.test.ts` | Valid and invalid order transitions, rollback on violation, append-only `OrderEvent` logging. |
| `apps/api` | `webhooks.service.test.ts` | HMAC SHA-256 verification, replay protection, timestamp drift check, idempotency. |
| `apps/api` | `assets.service.test.ts` | Redis cache hits, misses, TTL, and error handling. |

### End-to-End (E2E) Journeys

Located in `apps/web/e2e/`:
1. **Swap Journey (`swap-journey.spec.ts`)**:
   - Asset selection (XLM -> USDC).
   - Real-time quote polling and slippage calculation.
   - Wallet connection prompt and simulated signing response.
2. **Offramp Journey (`offramp-journey.spec.ts`)**:
   - Currency selection (USDC -> NGN/EUR).
   - SEP-24 interactive modal navigation.
   - Bank detail entry and pending transaction state assertion.
3. **Bridge Journey (`bridge-journey.spec.ts`)**:
   - Source/destination chain pairing (Ethereum -> Stellar).
   - Deposit address generation.
   - Progress bar and transfer status polling.

---

## 4. Best Practices for Writing Tests

### 1. Mocking HTTP and External APIs
Always use `vitest.fn()` or lightweight mock servers (like `MockAnchorServer`) rather than reaching out to live external networks:

```typescript
import { vi } from 'vitest';

// Good: Deterministic mock response
globalThis.fetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ status: 'completed' }), { status: 200 })
);
```

### 2. Timeouts and Asynchronous Operations
Never use hardcoded `sleep(1000)`. Instead:
- In Vitest: Use `vi.useFakeTimers()` or wait for specific promises.
- In Playwright: Use built-in web assertions like `await expect(locator).toBeVisible()`.

### 3. Testing State Transitions
When adding new states to `OrderStateMachineService`, verify both valid forward transitions and rejected invalid transitions:

```typescript
// Valid transition
const updated = await stateMachine.transition(orderId, 'PROCESSING');
expect(updated.status).toBe('PROCESSING');

// Invalid transition must throw OrderTransitionError
await expect(stateMachine.transition(orderId, 'CREATED')).rejects.toThrow(
  OrderTransitionError
);
```

---

## 5. Continuous Integration (CI) Pipeline

In GitHub Actions (`.github/workflows/ci.yml`), three jobs execute sequentially or in parallel:
1. **`security`**:
   - Secret scanning via Gitleaks and `scripts/scan-secrets.ts`.
   - Dependency vulnerability audit (`pnpm audit`).
2. **`ci`**:
   - Monorepo build (`pnpm build`).
   - Linting (`pnpm lint`).
   - Typechecking (`pnpm typecheck`).
   - Unit tests (`pnpm test`).
3. **`e2e`**:
   - Installs Playwright Chromium binaries.
   - Builds production web bundle.
   - Launches headless web server and executes the full E2E test suite.
