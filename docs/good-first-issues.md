# Good First Issues for New Contributors

Welcome to LumenFlow! This document contains **22 well-scoped, curated issues** ideal for first-time contributors. Each issue details the problem, expected behavior, affected files, and acceptance criteria.

---

### Issue #1: Add unit tests for `ApiErrorFilter` edge cases
- **Labels**: `good first issue`, `area/tests`, `help wanted`
- **Description**: `ApiErrorFilter` translates NestJS and Zod exceptions into uniform API error responses. We need test coverage for unexpected non-HTTP runtime errors (e.g. TypeError, SyntaxError) to ensure fallback 500 error envelopes work without leaking stack traces in production.
- **Affected Files**: `apps/api/src/common/__tests__/api-error.filter.test.ts`, `apps/api/src/common/filters/api-error.filter.ts`
- **Acceptance Criteria**:
  - Unit tests verify that unhandled exceptions produce HTTP 500 status.
  - Sentry exception tracking is called when `SENTRY_DSN` is configured.
  - Stack traces are omitted in production environment.

---

### Issue #2: Property-based tests for `QuoteEngine` slippage boundaries
- **Labels**: `good first issue`, `area/tests`, `help wanted`
- **Description**: Add generative/property-based tests verifying that `minimumReceived` is strictly monotonically decreasing as `slippageTolerance` increases from 0.001 to 0.50.
- **Affected Files**: `packages/quote-engine/src/__tests__/quote-engine.test.ts`
- **Acceptance Criteria**:
  - Generates 100 pseudo-random trade amounts and slippage percentages.
  - Asserts `destinationAmount >= minimumReceived` for all valid inputs.
  - Asserts negative slippage tolerances are rejected.

---

### Issue #3: Unit tests for `MetricsController` Prometheus payload formatting
- **Labels**: `good first issue`, `area/tests`, `help wanted`
- **Description**: Create unit tests for `MetricsController` to verify that `GET /metrics` returns Prometheus-compatible text (`text/plain; version=0.0.4`) and contains core metric gauges.
- **Affected Files**: `apps/api/src/metrics/__tests__/metrics.controller.test.ts`
- **Acceptance Criteria**:
  - Tests verify response content type is `text/plain`.
  - Asserts standard metric names (`lumenflow_http_requests_total`, `lumenflow_quotes_total`) appear in body.

---

### Issue #4: Document Soroban smart contract interaction patterns
- **Labels**: `good first issue`, `area/docs`, `help wanted`
- **Description**: Write a technical guide explaining how Soroban smart contracts interact with LumenFlow's transaction building layer via `@stellar/stellar-sdk` Contract and RPC classes.
- **Affected Files**: `docs/soroban-guide.md`
- **Acceptance Criteria**:
  - Explains invocation simulation (`simulateTransaction`).
  - Covers authorization entries (`SorobanCredentials`).
  - Documents testnet Soroban RPC endpoints and contract ID deployment steps.

---

### Issue #5: Add developer documentation for PostgreSQL index optimization
- **Labels**: `good first issue`, `area/docs`, `help wanted`
- **Description**: Document the composite and partial indexes used in `prisma/schema.prisma` (`Order`, `Quote`, `WebhookEvent`), explaining how index design supports high-throughput append-only order auditing.
- **Affected Files**: `docs/database-indexes.md`
- **Acceptance Criteria**:
  - Explains compound index `@@unique([provider, eventId])` for webhook idempotency.
  - Documents query execution plans (`EXPLAIN ANALYZE`) for order status queries.

---

### Issue #6: Add visual sequence diagram for SEP-24 interactive offramp
- **Labels**: `good first issue`, `area/docs`, `help wanted`
- **Description**: Add a detailed Mermaid sequence diagram illustrating the complete SEP-24 interaction: client challenge request, SEP-10 signing, interactive URL embedding, and status polling.
- **Affected Files**: `docs/architecture.md`
- **Acceptance Criteria**:
  - Valid Mermaid `sequenceDiagram` syntax rendered in Markdown.
  - Clearly shows client, API, Anchor, and Stellar Horizon boundaries.

---

### Issue #7: Add Escape key shortcut to dismiss slippage settings modal
- **Labels**: `good first issue`, `area/ui`, `help wanted`
- **Description**: When the swap slippage settings dropdown/modal is open, pressing the `Escape` key should dismiss the modal and restore focus to the trigger button.
- **Affected Files**: `apps/web/src/components/swap/slippage-modal.tsx`
- **Acceptance Criteria**:
  - Listening to `keydown` event for `'Escape'`.
  - Focus returns to the settings gear icon upon closure.

---

### Issue #8: Implement copy-to-clipboard button with visual feedback
- **Labels**: `good first issue`, `area/ui`, `help wanted`
- **Description**: On the bridge deposit and offramp status views, add a copy button for deposit addresses and transaction hashes with a temporary "Copied!" tooltip or icon change.
- **Affected Files**: `packages/ui/src/copy-button.tsx`, `apps/web/src/components/bridge/deposit-card.tsx`
- **Acceptance Criteria**:
  - Copies string using `navigator.clipboard.writeText`.
  - Replaces copy icon with checkmark for 2000ms.
  - Includes `aria-label="Copy to clipboard"`.

---

### Issue #9: Add filter reset button to transaction history table
- **Labels**: `good first issue`, `area/ui`, `help wanted`
- **Description**: In the transaction history view, when filtering by order type (`SWAP`, `BRIDGE`, `OFFRAMP`) or status (`COMPLETED`, `FAILED`), provide a "Clear Filters" button that resets all filters to default.
- **Affected Files**: `apps/web/src/components/history/transaction-filters.tsx`
- **Acceptance Criteria**:
  - Button is visible only when at least one filter is active.
  - Clicking resets URL search params and query state.

---

### Issue #10: Display token issuer tooltips for custom Stellar assets
- **Labels**: `good first issue`, `area/ui`, `help wanted`
- **Description**: In asset selector lists, non-native Stellar assets display truncated issuer addresses (e.g., `GBBD...FLA5`). Add a hover/focus tooltip showing the full 56-character public key and a link to Stellar Expert.
- **Affected Files**: `apps/web/src/components/swap/asset-selector-row.tsx`
- **Acceptance Criteria**:
  - Displays full public key in an accessible tooltip.
  - Link opens `https://stellar.expert/explorer/testnet/account/<issuer>` in a new tab with `rel="noopener noreferrer"`.

---

### Issue #11: Add `aria-live` region for real-time quote refresh
- **Labels**: `good first issue`, `area/a11y`, `help wanted`
- **Description**: When a quote auto-refreshes every 30 seconds, screen reader users should be notified subtly without interrupting speech.
- **Affected Files**: `apps/web/src/components/swap/quote-display.tsx`
- **Acceptance Criteria**:
  - Element has `aria-live="polite"` and `aria-atomic="true"`.
  - Screen reader receives text: "Quote updated: 1 XLM = 0.125 USDC".

---

### Issue #12: Ensure 4.5:1 contrast ratio for dark mode status badges
- **Labels**: `good first issue`, `area/a11y`, `help wanted`
- **Description**: Audit the Tailwind badge colors for `COMPLETED` (green), `PROCESSING` (blue), and `FAILED` (red) against WCAG AA standards (4.5:1 contrast against dark background `#0f172a`).
- **Affected Files**: `packages/ui/src/badge.tsx`
- **Acceptance Criteria**:
  - Colors verified using WebAIM or Lighthouse contrast checker.
  - Contrast ratio meets or exceeds 4.5:1.

---

### Issue #13: Add visible focus rings for tab navigation
- **Labels**: `good first issue`, `area/a11y`, `help wanted`
- **Description**: Ensure all navigational tabs (Swap, Bridge, Offramp) have a visible high-contrast focus outline (`focus-visible:ring-2 focus-visible:ring-blue-500`) when tabbed through with a keyboard.
- **Affected Files**: `apps/web/src/components/navigation/nav-tabs.tsx`
- **Acceptance Criteria**:
  - Outline is visible in both light and dark themes during keyboard tab navigation.
  - Mouse clicks do not trigger persistent focus outline.

---

### Issue #14: Add descriptive `aria-label` to wallet modal disconnect button
- **Labels**: `good first issue`, `area/a11y`, `help wanted`
- **Description**: The wallet connection button shows an icon when connected. Add an explicit `aria-label="Disconnect wallet <truncated-address>"` to improve assistive navigation.
- **Affected Files**: `apps/web/src/components/wallet/wallet-button.tsx`
- **Acceptance Criteria**:
  - `aria-label` includes wallet action and truncated address.
  - VoiceOver / NVDA announces full button purpose.

---

### Issue #15: Extract hardcoded swap widget strings to translation dictionary
- **Labels**: `good first issue`, `area/i18n`, `help wanted`
- **Description**: Lay ground work for internationalization by extracting hardcoded English user-facing text from `apps/web/src/components/swap/swap-widget.tsx` into a typed English dictionary `en.json`. *Note: Do NOT implement translation libraries; only extract keys.*
- **Affected Files**: `apps/web/src/locales/en.json`, `apps/web/src/components/swap/swap-widget.tsx`
- **Acceptance Criteria**:
  - Creates `apps/web/src/locales/en.json` with keys (e.g. `swap.you_pay`, `swap.you_receive`, `swap.connect_wallet`).
  - Imports strings from dictionary without changing UI appearance.

---

### Issue #16: Implement typed locale detection hook stub (`useLocale`)
- **Labels**: `good first issue`, `area/i18n`, `help wanted`
- **Description**: Create a React hook `useLocale()` that reads the browser `navigator.language` and returns a sanitized supported locale code (`'en'`, fallback to `'en'`).
- **Affected Files**: `apps/web/src/hooks/use-locale.ts`
- **Acceptance Criteria**:
  - Returns `'en'` for testnet milestone.
  - Unit test verifies fallback behavior on unknown locales.

---

### Issue #17: Format fiat amounts with `Intl.NumberFormat`
- **Labels**: `good first issue`, `area/i18n`, `help wanted`
- **Description**: Replace custom string concatenation for fiat currencies (e.g. `"$ " + amount`) with standard `Intl.NumberFormat` utility that formats numbers per currency code (USD, EUR, NGN).
- **Affected Files**: `packages/shared-types/src/formatters.ts`
- **Acceptance Criteria**:
  - Formats `150000` with currency `'NGN'` as `"NGN 150,000.00"`.
  - Handles zero and negative values gracefully.

---

### Issue #18: Implement adapter stub for Allbridge Core (`AllbridgeAdapter`)
- **Labels**: `good first issue`, `area/adapters`, `help wanted`
- **Description**: Create a structured skeleton for Allbridge Core implementing `BridgeAdapter` interface in `packages/bridge-adapters/src/adapters/allbridge.adapter.ts`.
- **Affected Files**: `packages/bridge-adapters/src/adapters/allbridge.adapter.ts`
- **Acceptance Criteria**:
  - Implements all `BridgeAdapter` methods with clear TODO comments and types.
  - Returns disabled/unsupported by default until audit completion.
  - Unit tests verify stub instantiation.

---

### Issue #19: Implement adapter stub for Mayan / Wormhole (`MayanAdapter`)
- **Labels**: `good first issue`, `area/adapters`, `help wanted`
- **Description**: Create an adapter skeleton for Mayan cross-chain swap protocol implementing `BridgeAdapter`.
- **Affected Files**: `packages/bridge-adapters/src/adapters/mayan.adapter.ts`
- **Acceptance Criteria**:
  - Implements `BridgeAdapter` interface.
  - Outlines Wormhole message submission parameters.
  - Unit test included.

---

### Issue #20: Implement adapter stub for Smile ID KYC (`SmileIdKycAdapter`)
- **Labels**: `good first issue`, `area/adapters`, `help wanted`
- **Description**: Create an adapter skeleton for Smile ID implementing `KycAdapter` interface for African identity verification (NIN/BVN).
- **Affected Files**: `packages/anchor-client/src/adapters/smile-id.adapter.ts`
- **Acceptance Criteria**:
  - Implements `KycAdapter` interface.
  - Maps Smile ID verification statuses (`ATTEMPT_COMPLETED` -> `VERIFIED`).
  - Unit test included.

---

### Issue #21: Implement adapter stub for Paystack NGN Payouts (`PaystackPayoutAdapter`)
- **Labels**: `good first issue`, `area/adapters`, `help wanted`
- **Description**: Create a payout adapter skeleton for Paystack Transfers API implementing `PayoutAdapter`.
- **Affected Files**: `packages/anchor-client/src/adapters/paystack-payout.adapter.ts`
- **Acceptance Criteria**:
  - Implements `PayoutAdapter` interface.
  - Documents header requirements (`Authorization: Bearer <secret>`, `Idempotency-Key`).
  - Unit test included.

---

### Issue #22: Add pre-commit hook scanning for private keys and seeds
- **Labels**: `good first issue`, `area/security`, `help wanted`
- **Description**: Configure Husky pre-commit hook to execute `pnpm run scan:secrets` on staged files prior to committing.
- **Affected Files**: `.husky/pre-commit`
- **Acceptance Criteria**:
  - Commits containing test secret keys (matching regex `S[A-Z0-9]{55}`) are blocked.
  - Permitted mock seeds (e.g., raw Ed25519 test fixtures) in `__tests__` are ignored.
