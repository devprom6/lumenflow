# LumenFlow Local Development Setup Guide

This guide walks you through configuring and running LumenFlow locally on your development machine.

---

## 1. Prerequisites

Before starting, ensure your system has the following installed:

- **Node.js**: `v20.x` or `v22.x` or `v24.x` (LTS recommended)
- **pnpm**: `v9.x` (`npm i -g pnpm`)
- **Git**: `v2.30+`
- **Docker & Docker Compose**: (Optional, recommended for PostgreSQL and Redis)

---

## 2. One-Command Quickstart (`pnpm bootstrap`)

The fastest way to get completely set up is via the bootstrap command:

```bash
git clone https://github.com/lumenflow/lumenflow.git
cd lumenflow

pnpm bootstrap
```

The bootstrap command will:
1. Verify Node.js and pnpm versions.
2. Install all workspace dependencies.
3. Generate the Prisma database client.
4. Launch PostgreSQL and Redis via Docker Compose (if Docker is running).
5. Apply database migrations (`prisma migrate deploy`).
6. Seed demo users, testnet quotes, and audit events.
7. Print all local service URLs and next steps.

Once completed, start all services with:
```bash
pnpm dev
```

---

## 3. Manual Step-by-Step Setup

If you prefer to configure your environment manually or are running native Postgres/Redis:

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Configure Environment Variables
Copy the example environment files for each application:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local
```

### Step 3: Start Infrastructure Services
If using Docker:
```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
```

If running native services:
- Ensure PostgreSQL is running on port `5432` with a database named `lumenflow_dev`.
- Ensure Redis is running on port `6379`.

### Step 4: Run Migrations and Seed
```bash
# Generate Prisma Client
pnpm --filter api exec prisma generate

# Apply migrations
pnpm --filter api db:migrate:deploy

# Seed initial testnet records
pnpm --filter api db:seed
```

### Step 5: Start Development Servers
```bash
pnpm dev
```

### Step 6: (Optional) Start Mock Anchor Service
In a separate terminal, launch the testnet SEP anchor:
```bash
pnpm mock-anchor
```
This runs the mock anchor server on `http://localhost:4001`, exposing SEP-1 (`/stellar.toml`), SEP-10 (`/auth`), SEP-12 (`/kyc`), and SEP-24 (`/sep24`).

---

## 4. Environment Variables Reference

### API Application (`apps/api/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `4000` | HTTP port for the NestJS API |
| `DATABASE_URL` | `postgresql://lumenflow:lumenflow_dev_password@localhost:5432/lumenflow_dev` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string for caching |
| `JWT_SECRET` | `dev-insecure-jwt-secret-do-not-use-in-prod` | Secret for issuing API session tokens |
| `ADMIN_API_KEY` | `dev-admin-secret-key-change-in-prod` | Secret for administrative safeguard endpoints |
| `WEBHOOK_SIGNING_SECRET` | `dev-webhook-secret-do-not-use-in-prod` | Secret used to verify HMAC webhook payloads |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Stellar Horizon Testnet endpoint |
| `STELLAR_NETWORK_PASSPHRASE`| `Test SDF Network ; September 2015` | Stellar network passphrase |
| `CORS_ORIGIN` | `http://localhost:3000` | Whitelisted frontend origins (comma-separated) |
| `SENTRY_DSN` | *(empty in dev)* | Optional Sentry DSN for exception tracking |

### Worker Application (`apps/worker/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ Redis broker endpoint |
| `METRICS_PORT` | `9102` | Worker Prometheus metrics HTTP port |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Stellar Horizon endpoint for reconciliation |
| `SENTRY_DSN` | *(empty in dev)* | Optional Sentry DSN for alert monitoring |

### Web Application (`apps/web/.env.local`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | NestJS API URL |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `TESTNET` | Active Stellar network (`TESTNET` or `MAINNET`) |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Client Horizon RPC endpoint |

---

## 5. Troubleshooting Guide

### 1. Database Connection Refused (`P1001: Can't reach database server at localhost:5432`)
- **Cause**: The PostgreSQL service is not running or port 5432 is blocked.
- **Solution**:
  - If using Docker: check container status with `docker ps`. Restart via `docker compose -f infra/docker/docker-compose.dev.yml up -d`.
  - If running locally: verify service with `pg_isready -h localhost -p 5432`.
  - Check whether another service (e.g. system PostgreSQL) is occupying port 5432.

### 2. Redis Connection Errors
- **Cause**: Redis server is offline on `localhost:6379`.
- **Solution**:
  - Test connectivity: `redis-cli ping` (should output `PONG`).
  - LumenFlow's `RedisService` includes an in-memory fallback map in development, but BullMQ worker requires a real Redis instance for queuing.

### 3. Horizon Testnet Rate Limits (`HTTP 429 Too Many Requests`)
- **Cause**: Stellar Horizon Testnet enforces public IP rate limits.
- **Solution**:
  - LumenFlow includes Redis caching for asset lists and quote intervals.
  - If testing heavy route queries, use an authenticated private Horizon node or configure a local standalone Stellar core.

### 4. `ERR_PNPM_UNEXPECTED_STORE` Error
- **Cause**: pnpm detected an existing `node_modules` linked to an incompatible store path.
- **Solution**:
  ```bash
  pnpm config set store-dir ~/.local/share/pnpm/store/v11/v3
  pnpm install
  ```

### 5. Docker CLI Not Available in Environment
- **Cause**: Running in a lightweight container, sandbox, or minimal Linux VM.
- **Solution**:
  - `pnpm bootstrap` detects when Docker is missing and does not fail. Simply point `DATABASE_URL` and `REDIS_URL` in your `.env` to external or locally installed instances.

### 6. Missing Playwright Browsers for E2E
- **Cause**: Playwright requires browser binaries to execute end-to-end tests.
- **Solution**:
  ```bash
  npx playwright install --with-deps chromium
  ```
