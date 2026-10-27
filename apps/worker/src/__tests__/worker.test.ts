import { describe, it, expect, beforeEach } from 'vitest';
import { MockBridgeAdapter } from '@lumenflow/bridge-adapters';
import { LoggingAlertHook } from '../alerts/logging-alert-hook';
import {
  BridgeStatusProcessor,
  type OrderStateUpdater,
} from '../processors/bridge-status.processor';
import { PayoutFollowupProcessor } from '../processors/payout-followup.processor';
import {
  WebhookRetryProcessor,
  type WebhookDispatcher,
} from '../processors/webhook-retry.processor';
import {
  OrderExpiryProcessor,
  type ExpiryStore,
} from '../processors/order-expiry.processor';
import {
  ReconciliationService,
  type ReconciliationDataSource,
  type InternalOrderRecord,
  type ExternalStatementRecord,
} from '../reconciliation/reconciliation.service';

describe('BridgeStatusProcessor', () => {
  let adapter: MockBridgeAdapter;
  let alertHook: LoggingAlertHook;
  let orderState: { id: string; status: string; transitions: string[] };
  let updater: OrderStateUpdater;
  let processor: BridgeStatusProcessor;

  beforeEach(() => {
    adapter = new MockBridgeAdapter();
    alertHook = new LoggingAlertHook();
    orderState = { id: 'order-1', status: 'AWAITING_SIGNATURE', transitions: [] };
    updater = {
      getOrder: () => Promise.resolve({ id: orderState.id, status: orderState.status }),
      transitionOrder: (_id, toStatus) => {
        orderState.status = toStatus;
        orderState.transitions.push(toStatus);
        return Promise.resolve();
      },
    };
    processor = new BridgeStatusProcessor(adapter, updater, alertHook, 10_000);
  });

  it('progresses order to COMPLETED when adapter transfer completes', async () => {
    const quote = await adapter.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '50',
    });
    const transfer = await adapter.buildTransfer(quote, 'G_SENDER');
    adapter.setCustomTransferStatus(transfer.transferId, { status: 'COMPLETED' });

    const result = await processor.process({
      orderId: orderState.id,
      transferId: transfer.transferId,
      provider: 'MockBridge',
      submittedAt: Date.now(),
    });

    expect(result.actionTaken).toBe('TRANSITIONED_TO_COMPLETED');
    expect(orderState.status).toBe('COMPLETED');
    expect(orderState.transitions).toContain('COMPLETED');
  });

  it('triggers stuck transfer alert when transfer is stuck', async () => {
    adapter.setSimulationMode('STUCK');
    const quote = await adapter.getQuote({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromAsset: 'USDC',
      toAsset: 'USDC',
      amount: '50',
    });
    const transfer = await adapter.buildTransfer(quote, 'G_SENDER');

    const result = await processor.process({
      orderId: orderState.id,
      transferId: transfer.transferId,
      provider: 'MockBridge',
      submittedAt: Date.now() - 20_000, // 20s ago (> 10s threshold)
    });

    expect(result.isStuck).toBe(true);
    const alerts = alertHook.getAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.type).toBe('STUCK_TRANSFER');
    expect(alerts[0]?.severity).toBe('CRITICAL');
  });

  it('is idempotent on duplicate processing of completed orders', async () => {
    orderState.status = 'COMPLETED';

    const result = await processor.process({
      orderId: orderState.id,
      transferId: 'br_already_done',
      provider: 'MockBridge',
      submittedAt: Date.now(),
    });

    expect(result.actionTaken).toBe('ALREADY_TERMINAL');
    expect(orderState.transitions.length).toBe(0);
  });
});

describe('PayoutFollowupProcessor', () => {
  let alertHook: LoggingAlertHook;
  let orderState: { id: string; status: string };
  let updater: OrderStateUpdater;

  beforeEach(() => {
    alertHook = new LoggingAlertHook();
    orderState = { id: 'order-payout-1', status: 'PROCESSING' };
    updater = {
      getOrder: () => Promise.resolve(orderState),
      transitionOrder: () => Promise.resolve(),
    };
  });

  it('raises alert when payout is pending past threshold', async () => {
    const processor = new PayoutFollowupProcessor(updater, alertHook, 5_000); // 5s threshold
    const result = await processor.process({
      orderId: orderState.id,
      externalId: 'payout-ref-123',
      provider: 'payout',
      submittedAt: Date.now() - 10_000, // 10s elapsed
    });

    expect(result.alertSent).toBe(true);
    const alerts = alertHook.getAlerts();
    expect(alerts.some((a) => a.type === 'PAYOUT_DELAY')).toBe(true);
  });
});

describe('WebhookRetryProcessor & DLQ', () => {
  let alertHook: LoggingAlertHook;

  beforeEach(() => {
    alertHook = new LoggingAlertHook();
  });

  it('calculates exponential backoff and retries on failure', async () => {
    const failingDispatcher: WebhookDispatcher = {
      dispatch: () => Promise.resolve(false),
    };
    const processor = new WebhookRetryProcessor(failingDispatcher, alertHook, 3);

    const res1 = await processor.process({
      eventId: 'evt-retry-1',
      provider: 'anchor',
      targetUrl: 'http://localhost:3000/webhook',
      payload: { test: true },
      attempt: 1,
    });

    expect(res1.status).toBe('RETRY');
    expect(res1.attempt).toBe(2);
    expect(res1.nextDelayMs).toBe(2000); // 2^1 * 1000
  });

  it('routes to Dead-Letter Queue (DLQ) after max attempts', async () => {
    const failingDispatcher: WebhookDispatcher = {
      dispatch: () => Promise.resolve(false),
    };
    const processor = new WebhookRetryProcessor(failingDispatcher, alertHook, 3);

    const resMax = await processor.process({
      eventId: 'evt-dlq-target',
      provider: 'bridge',
      targetUrl: 'http://localhost:3000/webhook',
      payload: { transferId: 'br_failed' },
      attempt: 3,
    });

    expect(resMax.status).toBe('SENT_TO_DLQ');
    const dlq = processor.getDlqRecords();
    expect(dlq.length).toBe(1);
    expect(dlq[0]?.eventId).toBe('evt-dlq-target');

    const alerts = alertHook.getAlerts();
    expect(alerts.some((a) => a.type === 'WEBHOOK_DLQ')).toBe(true);
  });

  it('is idempotent when event already succeeded', async () => {
    let callCount = 0;
    const dispatcher: WebhookDispatcher = {
      dispatch: () => {
        callCount++;
        return Promise.resolve(true);
      },
    };
    const processor = new WebhookRetryProcessor(dispatcher, alertHook, 3);

    await processor.process({
      eventId: 'evt-ok',
      provider: 'bridge',
      targetUrl: 'http://localhost:3000/webhook',
      payload: {},
      attempt: 1,
    });

    const res2 = await processor.process({
      eventId: 'evt-ok',
      provider: 'bridge',
      targetUrl: 'http://localhost:3000/webhook',
      payload: {},
      attempt: 1,
    });

    expect(res2.status).toBe('SUCCESS');
    expect(callCount).toBe(1);
  });
});

describe('OrderExpiryProcessor', () => {
  it('expires past-due orders', async () => {
    const expiredOrder = {
      id: 'order-past-due',
      status: 'AWAITING_SIGNATURE',
      expiresAt: new Date(Date.now() - 5000),
    };
    const validOrder = {
      id: 'order-active',
      status: 'AWAITING_SIGNATURE',
      expiresAt: new Date(Date.now() + 60000),
    };

    const expiredIds: string[] = [];
    const store: ExpiryStore = {
      getPendingOrders: () => Promise.resolve([expiredOrder, validOrder]),
      getPendingQuotes: () => Promise.resolve([]),
      markQuoteExpired: () => Promise.resolve(),
    };
    const updater: OrderStateUpdater = {
      getOrder: (id) => Promise.resolve({ id, status: 'AWAITING_SIGNATURE' }),
      transitionOrder: (id, toStatus) => {
        if (toStatus === 'EXPIRED') expiredIds.push(id);
        return Promise.resolve();
      },
    };

    const processor = new OrderExpiryProcessor(store, updater);
    const result = await processor.process();

    expect(result.expiredOrdersCount).toBe(1);
    expect(expiredIds).toEqual(['order-past-due']);
  });
});

describe('ReconciliationService & Seeded Mismatches', () => {
  let alertHook: LoggingAlertHook;

  beforeEach(() => {
    alertHook = new LoggingAlertHook();
  });

  it('detects clean state when internal orders and external statements match', async () => {
    const internalOrders: InternalOrderRecord[] = [
      {
        id: 'ord-1',
        type: 'BRIDGE',
        status: 'COMPLETED',
        sourceAmount: '100',
        externalId: 'ext-1',
        events: [
          { fromStatus: 'CREATED', toStatus: 'QUOTED' },
          { fromStatus: 'QUOTED', toStatus: 'AWAITING_SIGNATURE' },
          { fromStatus: 'AWAITING_SIGNATURE', toStatus: 'SUBMITTED' },
          { fromStatus: 'SUBMITTED', toStatus: 'PROCESSING' },
          { fromStatus: 'PROCESSING', toStatus: 'COMPLETED' },
        ],
      },
    ];

    const externalStatements: ExternalStatementRecord[] = [
      {
        id: 'stmt-1',
        externalId: 'ext-1',
        provider: 'MockBridge',
        status: 'COMPLETED',
        amount: '100',
      },
    ];

    const dataSource: ReconciliationDataSource = {
      getOrders: () => Promise.resolve(internalOrders),
      getExternalStatements: () => Promise.resolve(externalStatements),
      saveReport: () => Promise.resolve(),
    };

    const service = new ReconciliationService(dataSource, alertHook);
    const report = await service.runReconciliation();

    expect(report.status).toBe('CLEAN');
    expect(report.mismatchesCount).toBe(0);
    expect(alertHook.getAlerts().length).toBe(0);
  });

  it('runs and reports a seeded mismatch, raising critical alert', async () => {
    const dataSource: ReconciliationDataSource = {
      getOrders: () => Promise.resolve([]),
      getExternalStatements: () => Promise.resolve([]),
      saveReport: () => Promise.resolve(),
    };

    const service = new ReconciliationService(dataSource, alertHook);
    const report = await service.runWithSeededMismatch();

    expect(report.status).toBe('MISMATCHES_DETECTED');
    expect(report.mismatchesCount).toBe(1);
    expect(report.mismatches[0]?.mismatchType).toBe('AMOUNT_MISMATCH');

    const alerts = alertHook.getAlerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0]?.type).toBe('RECONCILIATION_MISMATCH');
    expect(alerts[0]?.severity).toBe('CRITICAL');
  });
});
