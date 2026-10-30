import * as http from 'node:http';
import {
  Registry,
  collectDefaultMetrics,
  Gauge,
  Counter,
} from 'prom-client';

export class WorkerMetricsService {
  private readonly registry: Registry;
  public readonly queueDepth: Gauge;
  public readonly stuckTransfersCount: Gauge;
  public readonly jobsProcessedTotal: Counter;
  public readonly reconciliationMismatchesTotal: Counter;

  private server: http.Server | null = null;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: 'lumenflow_worker_' });

    this.queueDepth = new Gauge({
      name: 'lumenflow_queue_depth',
      help: 'Current number of waiting or active jobs in worker queues',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.stuckTransfersCount = new Gauge({
      name: 'lumenflow_stuck_transfers_count',
      help: 'Number of detected stuck cross-chain bridge transfers',
      labelNames: ['provider'],
      registers: [this.registry],
    });

    this.jobsProcessedTotal = new Counter({
      name: 'lumenflow_worker_jobs_processed_total',
      help: 'Total jobs processed by worker processors',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });

    this.reconciliationMismatchesTotal = new Counter({
      name: 'lumenflow_reconciliation_mismatches_total',
      help: 'Total reconciliation ledger mismatches detected',
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  startServer(port: number = Number(process.env['WORKER_METRICS_PORT'] ?? 9102)): Promise<http.Server> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        void (async () => {
          if (req.url === '/metrics' && req.method === 'GET') {
            res.setHeader('Content-Type', this.getContentType());
            const metrics = await this.getMetrics();
            res.writeHead(200);
            res.end(metrics);
          } else if (req.url === '/health' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', service: 'lumenflow-worker' }));
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        })();
      });

      this.server.listen(port, () => {
        console.log(`Worker Prometheus metrics listening on http://localhost:${port}/metrics`);
        if (this.server) {
          resolve(this.server);
        }
      });
    });
  }

  stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
