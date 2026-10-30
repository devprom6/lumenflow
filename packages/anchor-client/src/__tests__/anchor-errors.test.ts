import { describe, it, expect, vi } from 'vitest';
import {
  AnchorClientError,
  Sep1Error,
  Sep10Error,
  Sep12Error,
  Sep24Error,
  TimeoutError,
  NetworkError,
} from '../errors';
import { requestWithRetry } from '../http';
import { Sep12Client } from '../sep12';
import { MockKycAdapter } from '../adapters/mock-kyc.adapter';
import { MockPayoutAdapter } from '../adapters/mock-payout.adapter';
import { z } from 'zod';

describe('Anchor Errors and HTTP Retries', () => {
  it('instantiates all error types with proper properties', () => {
    const errBase = new AnchorClientError('VALIDATION_ERROR', 'Validation failed', {
      statusCode: 400,
      details: { field: 'amount' },
    });
    expect(errBase.name).toBe('AnchorClientError');
    expect(errBase.code).toBe('VALIDATION_ERROR');
    expect(errBase.statusCode).toBe(400);
    expect(errBase.details).toEqual({ field: 'amount' });

    const sep1 = new Sep1Error('toml error', { info: 'missing field' });
    expect(sep1.name).toBe('Sep1Error');
    expect(sep1.code).toBe('SEP1_ERROR');
    expect(sep1.details).toEqual({ info: 'missing field' });

    const sep10 = new Sep10Error('auth failed', 401, { reason: 'bad sig' });
    expect(sep10.name).toBe('Sep10Error');
    expect(sep10.code).toBe('SEP10_ERROR');
    expect(sep10.statusCode).toBe(401);

    const sep12 = new Sep12Error('kyc failed', 422);
    expect(sep12.name).toBe('Sep12Error');
    expect(sep12.code).toBe('SEP12_ERROR');
    expect(sep12.statusCode).toBe(422);

    const sep24 = new Sep24Error('withdraw failed', 500);
    expect(sep24.name).toBe('Sep24Error');
    expect(sep24.code).toBe('SEP24_ERROR');

    const timeout = new TimeoutError();
    expect(timeout.name).toBe('TimeoutError');
    expect(timeout.code).toBe('TIMEOUT_ERROR');
    expect(timeout.message).toBe('Request timed out');

    const net = new NetworkError('socket hangup');
    expect(net.name).toBe('NetworkError');
    expect(net.code).toBe('NETWORK_ERROR');
  });

  describe('requestWithRetry', () => {
    const schema = z.object({ success: z.boolean() });

    it('retries on 500 server error and succeeds on subsequent attempt', async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Server error' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      const res = await requestWithRetry('https://example.com/test', schema, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(res.success).toBe(true);
      expect(attempts).toBe(2);
    });

    it('fails immediately without retry on 4xx client errors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        requestWithRetry('https://example.com/test', schema, { maxRetries: 2 }),
      ).rejects.toThrow('Anchor error (400)');
    });

    it('throws VALIDATION_ERROR when schema parse fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: 'not-a-boolean' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        requestWithRetry('https://example.com/test', schema, { maxRetries: 0 }),
      ).rejects.toThrow('Failed to validate anchor response');
    });
  });

  describe('Sep12Client', () => {
    it('deletes customer successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      const sep12 = new Sep12Client();
      await expect(
        sep12.deleteCustomer('https://anchor.com/kyc', 'token', 'GACCOUNT'),
      ).resolves.toBeUndefined();
    });

    it('allows 404 on deleteCustomer as idempotent success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
      const sep12 = new Sep12Client();
      await expect(
        sep12.deleteCustomer('https://anchor.com/kyc', 'token', 'GACCOUNT'),
      ).resolves.toBeUndefined();
    });

    it('throws Sep12Error if deleteCustomer returns 500', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
      const sep12 = new Sep12Client();
      await expect(
        sep12.deleteCustomer('https://anchor.com/kyc', 'token', 'GACCOUNT'),
      ).rejects.toThrow('DELETE customer failed with status 500');
    });
  });

  describe('Adapters coverage', () => {
    it('MockKycAdapter handles custom delays and setCustomer', async () => {
      const kyc = new MockKycAdapter({ simulateDelayMs: 5, autoApprove: false });
      kyc.setCustomer({
        id: 'c1',
        userId: 'u1',
        tier: 2,
        status: 'PENDING',
      });
      const cust = await kyc.getCustomerStatus('u1');
      expect(cust.status).toBe('PENDING');

      kyc.setStatus('u1', 'REJECTED');
      const updated = await kyc.getCustomerStatus('u1');
      expect(updated.status).toBe('REJECTED');
    });

    it('MockPayoutAdapter handles custom status and unknown payout query', async () => {
      const payout = new MockPayoutAdapter({ simulateDelayMs: 5 });
      payout.setDefaultStatus('PENDING');
      payout.setPayout('custom-id', {
        payoutId: 'custom-id',
        status: 'COMPLETED',
        fee: '0.50',
      });

      const res = await payout.getPayoutStatus('custom-id');
      expect(res.status).toBe('COMPLETED');

      const unknown = await payout.getPayoutStatus('non-existent');
      expect(unknown.status).toBe('FAILED');
    });
  });
});
