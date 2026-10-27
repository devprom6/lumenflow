#!/usr/bin/env node
/**
 * scripts/mock-anchor.ts
 *
 * Runs the mock anchor service for testing SEP-1, SEP-10, SEP-12, and SEP-24 flows.
 */

import { MockAnchorServer } from '../infra/mock-anchor/server.ts';

const port = Number(process.env['MOCK_ANCHOR_PORT'] ?? 4001);
const server = new MockAnchorServer({ port });

async function main(): Promise<void> {
  await server.start();
  console.log(`Mock Anchor running on http://localhost:${port}`);
  console.log(`Public Key: ${server.anchorKeypair.publicKey()}`);
  console.log(`SEP-1 TOML: http://localhost:${port}/.well-known/stellar.toml`);
  console.log(`SEP-10 Auth: http://localhost:${port}/auth`);
  console.log(`SEP-12 KYC: http://localhost:${port}/kyc`);
  console.log(`SEP-24 Withdraw: http://localhost:${port}/sep24`);

  process.on('SIGINT', () => {
    void server.stop().then(() => {
      console.log('Mock Anchor server stopped.');
      process.exit(0);
    });
  });
}

void main();
