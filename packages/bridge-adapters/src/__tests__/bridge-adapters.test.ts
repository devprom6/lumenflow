import { describe, expect, it } from 'vitest';
import { MockBridgeAdapter } from '../mock-bridge.adapter';
import { BridgeAdapterRegistry } from '../registry';

describe('MockBridgeAdapter', () => {
  it('returns supported routes when healthy', async () => {
    const adapter = new MockBridgeAdapter();
    const routes = await adapter.getSupportedRoutes();
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some((r) => r.id === 'stellar-eth-usdc')).toBe(true);
  });

  it('throws when getting routes if unhealthy', async () => {
    const adapter = new MockBridgeAdapter({ healthy: false });
    await expect(adapter.getSupportedRoutes()).rejects.toThrow(/unhealthy/i);
  });

  it('generates a valid quote with correct fees', async () => {
    const adapter = new MockBridgeAdapter({ feePercent: 0.01 }); // 1%
    const quote = await adapter.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '100',
    });

    expect(quote.provider).toBe('MockBridge');
    expect(quote.fromAmount).toBe('100');
    expect(quote.fee.amount).toBe('1.0000');
    expect(quote.toAmount).toBe('99.0000');
    expect(quote.estimatedDurationSeconds).toBe(120);
  });

  it('enforces min and max amount validation on quotes', async () => {
    const adapter = new MockBridgeAdapter();
    await expect(
      adapter.getQuote({
        fromChain: 'stellar',
        toChain: 'ethereum',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '1', // min is 10
      }),
    ).rejects.toThrow(/below minimum/i);

    await expect(
      adapter.getQuote({
        fromChain: 'stellar',
        toChain: 'ethereum',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '100000', // max is 50000
      }),
    ).rejects.toThrow(/exceeds maximum/i);
  });

  it('builds an unsigned transfer with non-custodial deposit info', async () => {
    const adapter = new MockBridgeAdapter();
    const quote = await adapter.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '200',
    });

    const sender = 'GBRIDGEUSERTESTNETSENDERADDRESS1111111111111111111111111';
    const unsigned = await adapter.buildTransfer(quote, sender);

    expect(unsigned.transferId).toMatch(/^br_/);
    expect(unsigned.depositAddress).toBeDefined();
    expect(unsigned.memo).toMatch(/^LF-BR-/);
    expect(unsigned.sender).toBe(sender);
    expect(unsigned.unsignedTransaction).toBeDefined();

    // Verify initial status
    const status = await adapter.getStatus(unsigned.transferId);
    expect(status.status).toBe('PENDING');
  });

  it('progresses status in SUCCESS mode', async () => {
    const adapter = new MockBridgeAdapter({ mode: 'SUCCESS' });
    const quote = await adapter.getQuote({
      fromChain: 'stellar',
      toChain: 'polygon',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '50',
    });
    const unsigned = await adapter.buildTransfer(quote, 'G_SENDER');

    const status1 = await adapter.getStatus(unsigned.transferId);
    expect(status1.status).toBe('PENDING');

    // Manually set custom status to simulate completed lifecycle
    adapter.setCustomTransferStatus(unsigned.transferId, { status: 'COMPLETED' });
    const status2 = await adapter.getStatus(unsigned.transferId);
    expect(status2.status).toBe('COMPLETED');
  });

  it('simulates FAILURE mode', async () => {
    const adapter = new MockBridgeAdapter({ mode: 'FAILURE' });
    const quote = await adapter.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '100',
    });
    const unsigned = await adapter.buildTransfer(quote, 'G_SENDER');

    const status = await adapter.getStatus(unsigned.transferId);
    expect(status.status).toBe('FAILED');
    expect(status.message).toBeDefined();
  });

  it('simulates STUCK mode with isStuck flag', async () => {
    const adapter = new MockBridgeAdapter({ mode: 'STUCK' });
    const quote = await adapter.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '100',
    });
    const unsigned = await adapter.buildTransfer(quote, 'G_SENDER');

    const status = await adapter.getStatus(unsigned.transferId);
    expect(status.status).toBe('STUCK');
    expect(status.isStuck).toBe(true);
  });
});

describe('BridgeAdapterRegistry', () => {
  it('registers and prioritizes adapters', () => {
    const registry = new BridgeAdapterRegistry();
    const primary = new MockBridgeAdapter({ name: 'PrimaryBridge' });
    const secondary = new MockBridgeAdapter({ name: 'SecondaryBridge' });

    registry.register(secondary, 20);
    registry.register(primary, 10);

    const ordered = registry.listAdapters();
    expect(ordered[0]?.name).toBe('PrimaryBridge');
    expect(ordered[1]?.name).toBe('SecondaryBridge');
  });

  it('falls back to second adapter if primary is unhealthy or fails', async () => {
    const registry = new BridgeAdapterRegistry();
    const primary = new MockBridgeAdapter({ name: 'PrimaryBridge', healthy: false });
    const secondary = new MockBridgeAdapter({ name: 'SecondaryBridge', healthy: true });

    registry.register(primary, 10);
    registry.register(secondary, 20);

    const { quote, adapterName } = await registry.getQuoteWithFallback({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '100',
    });

    expect(adapterName).toBe('SecondaryBridge');
    expect(quote.provider).toBe('SecondaryBridge');
  });

  it('enforces provider and route kill switches', async () => {
    const registry = new BridgeAdapterRegistry();
    const adapter = new MockBridgeAdapter({ name: 'PrimaryBridge' });
    registry.register(adapter, 10);

    // Test provider kill switch
    registry.setProviderKillSwitch('PrimaryBridge', true);
    expect(registry.isProviderKilled('PrimaryBridge')).toBe(true);
    await expect(
      registry.getQuoteWithFallback({
        fromChain: 'stellar',
        toChain: 'ethereum',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '100',
      }),
    ).rejects.toThrow(/No healthy bridge providers/i);

    // Unkill provider, test route kill switch
    registry.setProviderKillSwitch('PrimaryBridge', false);
    registry.setRouteKillSwitch('stellar-ethereum-usdc', true);
    expect(registry.isRouteKilled('stellar-ethereum-usdc')).toBe(true);

    await expect(
      registry.getQuoteWithFallback({
        fromChain: 'stellar',
        toChain: 'ethereum',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        amount: '100',
      }),
    ).rejects.toThrow(/safeguard kill switch/i);
  });

  it('applies override route limits in getSupportedRoutes', async () => {
    const registry = new BridgeAdapterRegistry();
    const adapter = new MockBridgeAdapter();
    registry.register(adapter);

    registry.setRouteLimits('stellar-eth-usdc', {
      minAmount: '25',
      maxAmount: '1000',
    });

    const routes = await registry.getSupportedRoutes();
    const ethRoute = routes.find((r) => r.id === 'stellar-eth-usdc');
    expect(ethRoute?.minAmount).toBe('25');
    expect(ethRoute?.maxAmount).toBe('1000');
  });
});
