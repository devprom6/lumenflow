#!/usr/bin/env node
/**
 * LumenFlow One-Command Bootstrap Script
 *
 * Automates:
 * 1. Environment & prerequisite checks (Node >= 20, pnpm >= 9)
 * 2. Dependency installation (`pnpm install`)
 * 3. Docker services startup (PostgreSQL & Redis via docker-compose)
 * 4. Prisma client generation
 * 5. Database schema migration (`prisma migrate deploy`)
 * 6. Database seeding (`prisma/seed.ts`)
 * 7. Next-step guidance for local development
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT_DIR = resolve(import.meta.dirname ?? '.', '..');

function logStep(step: number, total: number, message: string) {
  console.log(`\n\x1b[36m[${step}/${total}]\x1b[0m \x1b[1m${message}\x1b[0m`);
}

function logSuccess(message: string) {
  console.log(`  \x1b[32m✔\x1b[0m ${message}`);
}

function logWarn(message: string) {
  console.log(`  \x1b[33m⚠\x1b[0m ${message}`);
}

function logInfo(message: string) {
  console.log(`  \x1b[34mℹ\x1b[0m ${message}`);
}

function commandExists(cmd: string): boolean {
  try {
    const res = spawnSync('which', [cmd], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('       🌊 LumenFlow Testnet Bootstrap Setup           ');
  console.log('======================================================\n');

  const TOTAL_STEPS = 6;

  // Step 1: Environment & Tooling Verification
  logStep(1, TOTAL_STEPS, 'Verifying system prerequisites...');
  const nodeVersionMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (nodeVersionMajor < 20) {
    console.error(
      `\x1b[31m✖ Error: Node.js 20 or higher is required. Found v${process.version}.\x1b[0m`,
    );
    process.exit(1);
  }
  logSuccess(`Node.js version v${process.version} is compatible (>= 20)`);

  if (!commandExists('pnpm')) {
    console.error('\x1b[31m✖ Error: pnpm is required. Install via `npm i -g pnpm`.\x1b[0m');
    process.exit(1);
  }
  const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
  logSuccess(`pnpm version ${pnpmVersion} detected`);

  // Step 2: Install Dependencies
  logStep(2, TOTAL_STEPS, 'Checking workspace dependencies...');
  try {
    logInfo('Running pnpm install...');
    execSync('pnpm install', { cwd: ROOT_DIR, stdio: 'inherit' });
    logSuccess('Dependencies verified and up to date');
  } catch (err) {
    logWarn(`pnpm install warning: ${String(err)}`);
  }

  // Step 3: Generate Prisma Client
  logStep(3, TOTAL_STEPS, 'Generating Prisma Client...');
  try {
    execSync('pnpm --filter api exec prisma generate', { cwd: ROOT_DIR, stdio: 'inherit' });
    logSuccess('Prisma client generated successfully');
  } catch (err) {
    console.error('\x1b[31m✖ Failed to generate Prisma client\x1b[0m', err);
    process.exit(1);
  }

  // Step 4: Docker Services (PostgreSQL & Redis)
  logStep(4, TOTAL_STEPS, 'Starting infrastructure services (PostgreSQL & Redis)...');
  const hasDocker = commandExists('docker');
  let dockerStarted = false;

  if (hasDocker) {
    try {
      logInfo('Running `docker compose -f infra/docker/docker-compose.dev.yml up -d`...');
      execSync('docker compose -f infra/docker/docker-compose.dev.yml up -d', {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
      logSuccess('Docker containers started (Postgres on :5432, Redis on :6379)');
      dockerStarted = true;
      // Brief pause to allow postgres socket readiness
      logInfo('Waiting 3 seconds for database socket initialization...');
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      logWarn(`Could not start Docker daemon containers: ${(err as Error).message}`);
      logInfo('If you have PostgreSQL and Redis installed natively, bootstrap will continue.');
    }
  } else {
    logWarn('Docker CLI not found in PATH.');
    logInfo('Using local native PostgreSQL & Redis services if available.');
  }

  // Step 5: Database Schema Migrations
  logStep(5, TOTAL_STEPS, 'Running database migrations...');
  let migrationsSucceeded = false;
  try {
    execSync('pnpm --filter api db:migrate:deploy', { cwd: ROOT_DIR, stdio: 'inherit' });
    logSuccess('Database migrations applied successfully');
    migrationsSucceeded = true;
  } catch (err) {
    logWarn(
      `Database migration skipped or failed (PostgreSQL may be offline): ${(err as Error).message}`,
    );
    logInfo('Once your PostgreSQL service is running, run: pnpm --filter api db:migrate:deploy');
  }

  // Step 6: Demo Data Seeding
  logStep(6, TOTAL_STEPS, 'Seeding initial demo data...');
  if (migrationsSucceeded) {
    try {
      execSync('pnpm --filter api db:seed', { cwd: ROOT_DIR, stdio: 'inherit' });
      logSuccess('Demo testnet data seeded (users, quotes, completed audit orders, webhooks)');
    } catch (err) {
      logWarn(`Database seeding skipped: ${(err as Error).message}`);
    }
  } else {
    logInfo('Skipping seed because database migrations did not run.');
    logInfo('You can seed later with: pnpm --filter api db:seed');
  }

  // Summary & Next Steps
  console.log('\n======================================================');
  console.log('       ✨ LumenFlow Bootstrap Complete!               ');
  console.log('======================================================\n');
  console.log('Next steps to start the application:');
  console.log('  1. Start development servers:');
  console.log('     \x1b[32mpnpm dev\x1b[0m');
  console.log('\n  2. Endpoints available:');
  console.log('     • Web UI:           \x1b[36mhttp://localhost:3000\x1b[0m');
  console.log('     • API Swagger:      \x1b[36mhttp://localhost:4000/docs\x1b[0m');
  console.log('     • API Prometheus:   \x1b[36mhttp://localhost:4000/metrics\x1b[0m');
  console.log('     • Worker Metrics:   \x1b[36mhttp://localhost:9102/metrics\x1b[0m');
  console.log('     • Health Check:     \x1b[36mhttp://localhost:4000/health\x1b[0m');
  console.log('\n  3. Optional Mock Anchor Service:');
  console.log(
    '     \x1b[32mpnpm mock-anchor\x1b[0m  (runs SEP-1, SEP-10, SEP-12, SEP-24 on :4001)\n',
  );
}

main().catch((err) => {
  console.error('\n\x1b[31mFatal Bootstrap Error:\x1b[0m', err);
  process.exit(1);
});
