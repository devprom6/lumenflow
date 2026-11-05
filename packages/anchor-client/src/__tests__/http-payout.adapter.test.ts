import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpPayoutAdapter } from '../adapters/http-payout.adapter';
import type { PayoutParams } from '@lumenflow/shared-types';

describe('HttpPayoutAdapter', () => {
  let adapter: HttpPayoutAdapter;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof global.fetch;
    adapter = new HttpPayoutAdapter({
      name: 'TestPayout',
      apiUrl: 'https://api.testpayout.io',
      secretKey: 'secret-key',
      maxRetries: 0,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const samplePayoutParams: PayoutParams = {
    orderId: '00000000-0000-0000-0000-000000000000',
    amount: '50000.00',
    currency: 'NGN',
    recipient: {
      bankName: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'Test User',
    },
    memo: 'Offramp payout',
  };

  describe('initiatePayout', () => {
    it('returns a PayoutResult with mapped status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payoutId: 'pay-123',
          status: 'success',
          reference: 'ref-abc',
          fee: '1.50',
        }),
      });

      const result = await adapter.initiatePayout(samplePayoutParams);

      expect(result.payoutId).toBe('pay-123');
      expect(result.status).toBe('COMPLETED');
      expect(result.externalReference).toBe('ref-abc');
      expect(result.fee).toBe('1.50');
    });

    it('maps processing status correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payoutId: 'pay-456',
          status: 'processing',
          reference: 'ref-def',
        }),
      });

      const result = await adapter.initiatePayout(samplePayoutParams);
      expect(result.status).toBe('PROCESSING');
    });

    it('sends bank transfer fields in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payoutId: 'p1', status: 'success' }),
      });

      await adapter.initiatePayout(samplePayoutParams);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.bank_name).toBe('GTBank');
      expect(body.account_number).toBe('0123456789');
      expect(body.account_name).toBe('Test User');
      expect(body.amount).toBe('50000.00');
      expect(body.currency).toBe('NGN');
      expect(body.reference).toBe(samplePayoutParams.orderId);
    });
  });

  describe('getPayoutStatus', () => {
    it('returns the current status of a payout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payoutId: 'pay-123',
          status: 'completed',
          reference: 'ref-abc',
          fee: '1.50',
        }),
      });

      const result = await adapter.getPayoutStatus('pay-123');
      expect(result.payoutId).toBe('pay-123');
      expect(result.status).toBe('COMPLETED');
      expect(result.fee).toBe('1.50');
    });

    it('maps failed status correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payoutId: 'pay-789',
          status: 'failed',
          message: 'Invalid account number',
        }),
      });

      const result = await adapter.getPayoutStatus('pay-789');
      expect(result.status).toBe('FAILED');
    });
  });
});
