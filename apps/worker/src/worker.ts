import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { LoggingAlertHook } from './alerts/logging-alert-hook';
import { SentryAlertHook } from './alerts/sentry-alert-hook';
import type { AlertHook } from './alerts/alert-hook.interface';
import {
  BridgeStatusProcessor,
  type BridgeStatusJobData,
  type OrderStateUpdater,
} from './processors/bridge-status.processor';
import {
  PayoutFollowupProcessor,
  type PayoutFollowupJobData,
} from './processors/payout-followup.processor';
import {
  WebhookRetryProcessor,
  type WebhookRetryJobData,
  type WebhookDispatcher,
} from './processors/webhook-retry.processor';
import {
  OrderExpiryProcessor,
  type ExpiryStore,
} from './processors/order-expiry.processor';
import {
  ReconciliationService,
  type ReconciliationDataSource,
} from './reconciliation/reconciliation.service';
import { MockBridgeAdapter } from '@lumenflow/bridge-adapters';
import { WorkerMetricsService } from './metrics/worker-metrics';

export const QUEUES = {
  BRIDGE_STATUS: 'bridge-status',
  PAYOUT_FOLLOWUP: 'payout-followup',
  WEBHOOK_RETRY: 'webhook-retries',
  ORDER_EXPIRY: 'order-expiry',
} as const;

export class LumenFlowWorkerService {
  public readonly alertHook: AlertHook;
  public readonly mockAdapter: MockBridgeAdapter;
  public readonly bridgeProcessor: BridgeStatusProcessor;
  public readonly payoutProcessor: PayoutFollowupProcessor;
  public readonly webhookProcessor: WebhookRetryProcessor;
  public readonly expiryProcessor: OrderExpiryProcessor;
  public readonly reconciliationService: ReconciliationService;
  public readonly metricsService: WorkerMetricsService;

  private redisClient: Redis | null = null;
  private workers: Worker[] = [];

  constructor(
    orderUpdater: OrderStateUpdater,
    webhookDispatcher: WebhookDispatcher,
    expiryStore: ExpiryStore,
    reconciliationSource: ReconciliationDataSource,
  ) {
    this.alertHook = new SentryAlertHook(new LoggingAlertHook());
    this.mockAdapter = new MockBridgeAdapter();
    this.metricsService = new WorkerMetricsService();

    this.bridgeProcessor = new BridgeStatusProcessor(
      this.mockAdapter,
      orderUpdater,
      this.alertHook,
    );

    this.payoutProcessor = new PayoutFollowupProcessor(
      orderUpdater,
      this.alertHook,
    );

    this.webhookProcessor = new WebhookRetryProcessor(
      webhookDispatcher,
      this.alertHook,
    );

    this.expiryProcessor = new OrderExpiryProcessor(
      expiryStore,
      orderUpdater,
    );

    this.reconciliationService = new ReconciliationService(
      reconciliationSource,
      this.alertHook,
    );
  }

  public async start(): Promise<void> {
    // Start worker metrics HTTP server
    try {
      await this.metricsService.startServer();
    } catch (err) {
      console.warn(`Could not start worker metrics server: ${String(err)}`);
    }

    const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
    try {
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000,
      });

      await this.redisClient.connect();
      console.log(`Connected to Redis at ${redisUrl}. Initializing BullMQ workers...`);

      const connection = this.redisClient;

      // 1. Bridge status worker
      const bridgeWorker = new Worker<BridgeStatusJobData>(
        QUEUES.BRIDGE_STATUS,
        async (job: Job<BridgeStatusJobData>) => {
          try {
            const res = await this.bridgeProcessor.process(job.data);
            this.metricsService.jobsProcessedTotal.labels(QUEUES.BRIDGE_STATUS, 'success').inc();
            if (res.isStuck) {
              this.metricsService.stuckTransfersCount.labels('MockBridge').inc();
            }
            return res;
          } catch (err) {
            this.metricsService.jobsProcessedTotal.labels(QUEUES.BRIDGE_STATUS, 'failed').inc();
            throw err;
          }
        },
        { connection },
      );
      this.workers.push(bridgeWorker);

      // 2. Payout followup worker
      const payoutWorker = new Worker<PayoutFollowupJobData>(
        QUEUES.PAYOUT_FOLLOWUP,
        async (job: Job<PayoutFollowupJobData>) => {
          try {
            const res = await this.payoutProcessor.process(job.data);
            this.metricsService.jobsProcessedTotal.labels(QUEUES.PAYOUT_FOLLOWUP, 'success').inc();
            return res;
          } catch (err) {
            this.metricsService.jobsProcessedTotal.labels(QUEUES.PAYOUT_FOLLOWUP, 'failed').inc();
            throw err;
          }
        },
        { connection },
      );
      this.workers.push(payoutWorker);

      // 3. Webhook retries worker
      const webhookWorker = new Worker<WebhookRetryJobData>(
        QUEUES.WEBHOOK_RETRY,
        async (job: Job<WebhookRetryJobData>) => {
          try {
            const res = await this.webhookProcessor.process(job.data);
            this.metricsService.jobsProcessedTotal.labels(QUEUES.WEBHOOK_RETRY, 'success').inc();
            return res;
          } catch (err) {
            this.metricsService.jobsProcessedTotal.labels(QUEUES.WEBHOOK_RETRY, 'failed').inc();
            throw err;
          }
        },
        { connection },
      );
      this.workers.push(webhookWorker);

      // 4. Order expiry worker
      const expiryWorker = new Worker(
        QUEUES.ORDER_EXPIRY,
        async () => {
          try {
            const res = await this.expiryProcessor.process();
            this.metricsService.jobsProcessedTotal.labels(QUEUES.ORDER_EXPIRY, 'success').inc();
            return res;
          } catch (err) {
            this.metricsService.jobsProcessedTotal.labels(QUEUES.ORDER_EXPIRY, 'failed').inc();
            throw err;
          }
        },
        { connection },
      );
      this.workers.push(expiryWorker);

      console.log('All 4 BullMQ workers active and listening on queues.');
    } catch {
      console.warn('Redis unavailable. Operating in standalone resilient processor mode.');
    }
  }

  public async stop(): Promise<void> {
    await this.metricsService.stopServer();
    for (const w of this.workers) {
      await w.close();
    }
    this.workers = [];
    if (this.redisClient) {
      this.redisClient.disconnect();
      this.redisClient = null;
    }
  }

  public createQueues(connection: Redis) {
    return {
      bridgeStatus: new Queue(QUEUES.BRIDGE_STATUS, { connection }),
      payoutFollowup: new Queue(QUEUES.PAYOUT_FOLLOWUP, { connection }),
      webhookRetry: new Queue(QUEUES.WEBHOOK_RETRY, { connection }),
      orderExpiry: new Queue(QUEUES.ORDER_EXPIRY, { connection }),
    };
  }
}
