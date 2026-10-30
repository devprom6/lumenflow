# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-30

### Added
- **Non-Custodial Architecture & Security Hardening**:
  - Strict Content Security Policy (CSP), HSTS, and frame protection middleware.
  - Strict CORS origin whitelisting with credentials handling.
  - Rate limiting via `@nestjs/throttler` across auth, swap, offramp, bridge, and webhook controllers.
  - HMAC SHA-256 webhook signature verification with `crypto.timingSafeEqual` and timestamp drift bounds.
  - Production secrets validation preventing default keys.
  - Admin safeguards guard (`x-admin-key`) protecting bridge kill-switch and route limits.
  - Automated secret scanning (`scan:secrets`) and high-severity dependency vulnerability audit in CI.
  - Comprehensive threat model documentation (`docs/threat-model.md`).

- **Observability & Reliability**:
  - Prometheus `/metrics` endpoints on API (`:4000/metrics`) and Worker (`:9102/metrics`).
  - Core metrics: quote latency histogram, swap/offramp/bridge counters, BullMQ queue depth, stuck transfer counts, and reconciliation mismatch gauges.
  - Sentry exception tracking hooks (env-gated) across NestJS API and BullMQ worker.
  - Starter Grafana dashboard JSON (`infra/monitoring/grafana/dashboards/lumenflow-overview.json`).
  - Prometheus alerting rules (`infra/monitoring/prometheus/alerts/lumenflow-alerts.yml`).
  - Redis caching for supported asset discovery with 1-hour TTL.

- **Quality & Domain Test Coverage**:
  - Raised critical domain logic coverage to $\ge 80\%$ (State Machine 100%, Quote Engine 96.5%, Adapters >80%, Webhook Ingestion 80.6%).
  - Playwright end-to-end (E2E) testing suite running headlessly in CI across swap, bridge, and offramp journeys.
  - Verified append-only transactional state machine transitions.

- **Developer & Contributor Experience**:
  - One-command bootstrap command (`pnpm bootstrap`) to verify prerequisites, configure dependencies, start Docker services, run migrations, and seed demo records.
  - Full architectural documentation (`docs/architecture.md`), local setup guide (`docs/local-setup.md`), and testing guide (`docs/testing-guide.md`).
  - Provider integration guide (`docs/providers.md`) covering bridge adapters, SEP-10/12/24 anchors, KYC, and payout rails.
  - Incident response runbooks (`docs/runbooks/`): stuck bridge transfers, failed fiat payouts, webhook replays, and provider outages.
  - 20 well-scoped good first issues (`docs/good-first-issues.md`) with actionable descriptions and labels.
  - Repository governance files: `.github/CODEOWNERS`, `.github/dependabot.yml`, and tag-triggered release workflow `.github/workflows/release.yml`.
