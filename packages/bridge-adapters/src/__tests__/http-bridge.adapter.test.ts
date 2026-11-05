import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpBridgeAdapter } from '../adapters/http-bridge.adapter';
import type { BridgeRoute } from '@lumenflow/shared-types';

describe('HttpBridgeAdapter', () => {
  let adapter: HttpBridgeAdapter;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockRoutes: BridgeRoute[] = [
    {
      id: 'stellar-ethereum-USDC',
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      minAmount: '10.0',
      maxAmount: '50000.0',
      estimatedDurationSeconds: 300,
      enabled: true,
    },
  ];

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof global.fetch;

    adapter = new HttpBridgeAdapter({
      name: 'TestBridge',
      apiUrl: 'https://api.testbridge.io',
      apiKey: 'test-api-key',
      routes: mockRoutes,
      maxRetries: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isHealthy', () => {
    it('returns true when /health responds 200', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await adapter.isHealthy();
      expect(result).toBe(true);
    });

    it('returns false when /health throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'));
      const result = await adapter.isHealthy();
      expect(result).toBe(false);
    });
  });

  describe('getSupportedRoutes', () => {
    it('returns cached routes if provided in config', async () => {
      const result = await adapter.getSupportedRoutes();
      expect(result).toEqual(mockRoutes);
    });
  });

  describe('getQuote', () => {
    it('returns a properly mapped BridgeQuote', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteId: 'q-123',
          fromAmount: '100.0000000',
          toAmount: '99.5000000',
          fee: { amount: '0.50', asset: 'USDC' },
          rate: '0.9950',
          estimatedDurationSeconds: 180,
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
        }),
      });

      const quote = await adapter.getQuote({
        fromChain: 'stellar',
        toChain: 'ethereum',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '100.0000000',
      });

      expect(quote.provider).toBe('TestBridge');
      expect(quote.fromAmount).toBe('100.0000000');
      expect(quote.toAmount).toBe('99.5000000');
      expect(quote.fee.amount).toBe('0.50');
      expect(quote.id).toBe('q-123');
    });
  });

  describe('buildTransfer', () => {
    it('returns an UnsignedTransfer with deposit address and memo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transferId: 't-456',
          unsignedTransaction: 'base64xdr...',
          depositAddress: 'GADEPOSIT...',
          memo: 'lumenflow-123',
        }),
      });

      const quote = {
        id: 'q-123',
        provider: 'TestBridge',
        fromChain: 'stellar',
        toChain: 'ethereum',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        fromAmount: '100.0000000',
        toAmount: '99.5000000',
        estimatedDurationSeconds: 180,
        fee: { amount: '0.50', asset: 'USDC' },
        rate: '0.9950',
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const transfer = await adapter.buildTransfer(quote, 'GASENDER...');
      expect(transfer.transferId).toBe('t-456');
      expect(transfer.sender).toBe('GASENDER...');
      expect(transfer.depositAddress).toBe('GADEPOSIT...');
      expect(transfer.memo).toBe('lumenflow-123');
    });
  });

  describe('getStatus', () => {
    it('maps COMPLETED status correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transferId: 't-456',
          status: 'completed',
          fromTxHash: '0xabc',
          toTxHash: '0xdef',
          confirmations: 12,
          requiredConfirmations: 12,
        }),
      });

      const status = await adapter.getStatus('t-456');
      expect(status.status).toBe('COMPLETED');
      expect(status.fromTxHash).toBe('0xabc');
    });

    it('maps FAILED status correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transferId: 't-456',
          status: 'failed',
          message: 'Insufficient liquidity',
        }),
      });

      const status = await adapter.getStatus('t-456');
      expect(status.status).toBe('FAILED');
      expect(status.message).toBe('Insufficient liquidity');
    });

    it('maps PENDING status correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transferId: 't-456',
          status: 'pending',
          confirmations: 3,
          requiredConfirmations: 12,
        }),
      });

      const status = await adapter.getStatus('t-456');
      expect(status.status).toBe('PENDING');
      expect(status.confirmations).toBe(3);
    });
  });
});
