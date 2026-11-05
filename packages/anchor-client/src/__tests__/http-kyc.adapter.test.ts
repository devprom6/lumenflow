import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpKycAdapter } from '../adapters/http-kyc.adapter';

describe('HttpKycAdapter', () => {
  let adapter: HttpKycAdapter;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof global.fetch;
    adapter = new HttpKycAdapter({
      name: 'TestKYC',
      apiUrl: 'https://api.testkyc.io',
      apiKey: 'test-key',
      partnerId: 'partner-123',
      maxRetries: 0,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  describe('getCustomerStatus', () => {
    it('maps provider response to KycCustomer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'kyc-123',
          userId: 'user-456',
          status: 'verified',
          tier: 2,
          verifiedAt: '2026-01-01T00:00:00.000Z',
        }),
      });

      const customer = await adapter.getCustomerStatus('user-456');
      expect(customer.status).toBe('VERIFIED');
      expect(customer.tier).toBe(2);
      expect(customer.id).toBe('kyc-123');
    });

    it('maps pending status correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'kyc-1', userId: 'u1', status: 'in_review' }),
      });

      const customer = await adapter.getCustomerStatus('u1');
      expect(customer.status).toBe('PENDING');
    });

    it('maps rejected status correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'kyc-1', userId: 'u1', status: 'rejected', flags: ['mismatch'] }),
      });

      const customer = await adapter.getCustomerStatus('u1');
      expect(customer.status).toBe('REJECTED');
      expect(customer.flags).toEqual(['mismatch']);
    });
  });

  describe('submitVerification', () => {
    it('submits verification data and returns upgraded tier for national_id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'kyc-new',
          userId: 'u1',
          status: 'pending',
        }),
      });

      const customer = await adapter.submitVerification('u1', {
        id_number: 'ABC123456',
        full_name: 'Test User',
      });

      expect(customer.tier).toBe(2);
      expect(customer.status).toBe('PENDING');
    });

    it('upgrades to tier 3 for passport/biometric', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'kyc-new',
          userId: 'u1',
          status: 'verified',
          verifiedAt: '2026-01-01T00:00:00.000Z',
        }),
      });

      const customer = await adapter.submitVerification('u1', {
        passport_number: 'P12345',
        biometric: true,
      });

      expect(customer.tier).toBe(3);
      expect(customer.status).toBe('VERIFIED');
    });

    it('sends partnerId and callbackUrl in request body', async () => {
      const adapterWithCallback = new HttpKycAdapter({
        name: 'TestKYC',
        apiUrl: 'https://api.testkyc.io',
        apiKey: 'test-key',
        partnerId: 'partner-123',
        callbackUrl: 'https://lumenflow.app/kyc-callback',
        maxRetries: 0,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'kyc-1', userId: 'u1', status: 'pending' }),
      });

      await adapterWithCallback.submitVerification('u1', { full_name: 'Test' });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.partnerId).toBe('partner-123');
      expect(body.callbackUrl).toBe('https://lumenflow.app/kyc-callback');
    });
  });
});
