import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Keypair, Networks } from '@stellar/stellar-sdk';
import { AnchorClient } from '../anchor-client';
import { parseStellarToml } from '../sep1';
import { Sep10Client } from '../sep10';
import { MockKycAdapter } from '../adapters/mock-kyc.adapter';
import { MockPayoutAdapter } from '../adapters/mock-payout.adapter';
import { MockAnchorServer } from '../mock-anchor/server';
import { Sep1Error } from '../errors';

describe('AnchorClient & Mock Anchor Integration', () => {
  const TEST_PORT = 4099;
  const mockAnchor = new MockAnchorServer({
    port: TEST_PORT,
    signingSecret: 'test-signing-secret',
  });
  let client: AnchorClient;

  beforeAll(async () => {
    await mockAnchor.start();
    client = new AnchorClient({
      timeoutMs: 3000,
      maxRetries: 1,
    });
  });

  afterAll(async () => {
    await mockAnchor.stop();
  });

  describe('SEP-1: stellar.toml discovery', () => {
    it('discovers and parses stellar.toml correctly from mock anchor', async () => {
      const toml = await client.discoverToml(mockAnchor.baseUrl);
      expect(toml.VERSION).toBe('2.0.0');
      expect(toml.SIGNING_KEY).toBe(mockAnchor.anchorKeypair.publicKey());
      expect(toml.WEB_AUTH_ENDPOINT).toBe(`${mockAnchor.baseUrl}/auth`);
      expect(toml.TRANSFER_SERVER_SEP0024).toBe(`${mockAnchor.baseUrl}/sep24`);
      expect(toml.KYC_SERVER).toBe(`${mockAnchor.baseUrl}/kyc`);
      expect(toml.CURRENCIES).toBeDefined();
      expect(toml.CURRENCIES?.length).toBeGreaterThan(0);
      expect(toml.CURRENCIES?.[0]?.code).toBe('USDC');
    });

    it('parses raw TOML text with currencies and metadata', () => {
      const rawToml = `
VERSION = "2.0.0"
SIGNING_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

[[CURRENCIES]]
code = "USDC"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
is_asset_anchored = true
`;
      const parsed = parseStellarToml(rawToml);
      expect(parsed.VERSION).toBe('2.0.0');
      expect(parsed.CURRENCIES?.[0]?.code).toBe('USDC');
      expect(parsed.CURRENCIES?.[0]?.is_asset_anchored).toBe(true);
    });

    it('throws Sep1Error for invalid toml', () => {
      expect(() => parseStellarToml('CURRENCIES = "invalid-type"')).toThrow(Sep1Error);
    });
  });

  describe('SEP-10: Web Authentication', () => {
    it('requests challenge, signs locally, and receives JWT token', async () => {
      const clientKeypair = Keypair.random();
      const authEndpoint = `${mockAnchor.baseUrl}/auth`;

      // 1. Get challenge XDR
      const challenge = await client.getAuthChallenge(
        authEndpoint,
        clientKeypair.publicKey(),
      );
      expect(challenge.transaction).toBeDefined();
      expect(typeof challenge.transaction).toBe('string');

      // 2. Sign locally with client's wallet key
      const signedXdr = Sep10Client.signChallengeLocally(
        challenge.transaction,
        clientKeypair,
        Networks.TESTNET,
      );

      // 3. Submit to get token
      const authResult = await client.submitAuthChallenge(authEndpoint, signedXdr);
      expect(authResult.token).toBeDefined();
      expect(authResult.token.startsWith('mock-sep10-token-')).toBe(true);
    });
  });

  describe('SEP-12: Customer KYC', () => {
    it('retrieves customer info and submits verification data', async () => {
      const kycServer = `${mockAnchor.baseUrl}/kyc`;
      const token = 'mock-test-token';
      const testAccount = Keypair.random().publicKey();

      // Submit KYC data
      const putResult = await client.putCustomerKyc(kycServer, token, {
        account: testAccount,
        first_name: 'Alice',
        last_name: 'Tester',
        email_address: 'alice@example.com',
        id_type: 'PASSPORT',
        id_number: 'P12345678',
      });
      expect(putResult.status).toBe('ACCEPTED');
      expect(putResult.id).toBe(`cust-${testAccount}`);

      // Query KYC data
      const getResult = await client.getCustomerKyc(kycServer, token, {
        account: testAccount,
      });
      expect(getResult.status).toBe('ACCEPTED');
      expect(getResult.id).toBe(`cust-${testAccount}`);
    });
  });

  describe('SEP-24: Interactive Withdraw', () => {
    it('initiates interactive withdraw and polls transaction status', async () => {
      const transferServer = `${mockAnchor.baseUrl}/sep24`;
      const token = 'mock-test-token';
      const clientAccount = Keypair.random().publicKey();

      // Initiate withdraw
      const withdraw = await client.initiateWithdraw(transferServer, token, {
        asset_code: 'USDC',
        account: clientAccount,
        amount: '250.00',
      });

      expect(withdraw.type).toBe('interactive_customer_info_needed');
      expect(withdraw.url).toContain('/interactive?transaction_id=');
      expect(withdraw.id.startsWith('sep24-')).toBe(true);

      // Query status
      const tx = await client.getTransaction(transferServer, token, withdraw.id);
      expect(tx.id).toBe(withdraw.id);
      expect(tx.status).toBe('incomplete');
      expect(tx.amount_in).toBe('250.00');

      // Complete interactive step via form submit
      const completeRes = await fetch(`${mockAnchor.baseUrl}/interactive/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          transaction_id: withdraw.id,
          bank_name: 'Access Bank',
          account_number: '0123456789',
        }).toString(),
      });
      expect(completeRes.ok).toBe(true);

      // Re-query: transaction has transitioned to pending_user_transfer_start with anchor account
      const updatedTx = await client.getTransaction(transferServer, token, withdraw.id);
      expect(updatedTx.status).toBe('pending_user_transfer_start');
      expect(updatedTx.withdraw_anchor_account).toBe(mockAnchor.anchorKeypair.publicKey());
      expect(updatedTx.withdraw_memo).toBeDefined();
    });
  });

  describe('Timeout and Error Handling', () => {
    it('handles timeout when endpoint is unreachable', async () => {
      const slowClient = new AnchorClient({
        timeoutMs: 50,
        maxRetries: 0,
      });

      await expect(
        slowClient.discoverToml('http://10.255.255.1:9999'),
      ).rejects.toThrow();
    });
  });

  describe('Mock Adapters', () => {
    it('MockKycAdapter manages tiers and status', async () => {
      const kyc = new MockKycAdapter({ defaultTier: 1 });
      const status1 = await kyc.getCustomerStatus('user-1');
      expect(status1.tier).toBe(1);
      expect(status1.status).toBe('VERIFIED');

      // Upgrades tier when ID is submitted
      const upgraded = await kyc.submitVerification('user-1', { id_number: 'NIN12345' });
      expect(upgraded.tier).toBe(2);

      kyc.setTier('user-1', 3);
      const tier3 = await kyc.getCustomerStatus('user-1');
      expect(tier3.tier).toBe(3);
    });

    it('MockPayoutAdapter initiates payouts and returns status', async () => {
      const payout = new MockPayoutAdapter();
      const result = await payout.initiatePayout({
        orderId: '11111111-2222-3333-4444-555555555555',
        amount: '150000.00',
        currency: 'NGN',
        recipient: {
          bankName: 'GTBank',
          accountNumber: '0987654321',
          accountName: 'John Doe',
        },
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.payoutId).toBeDefined();

      const queried = await payout.getPayoutStatus(result.payoutId);
      expect(queried.status).toBe('COMPLETED');

      // Configurable failure simulation
      payout.setSimulateFailure(true, 'Insufficient liquidity');
      await expect(
        payout.initiatePayout({
          orderId: '22222222-3333-4444-5555-666666666666',
          amount: '5000000.00',
          currency: 'NGN',
          recipient: {},
        }),
      ).rejects.toThrow('Insufficient liquidity');
    });
  });
});
