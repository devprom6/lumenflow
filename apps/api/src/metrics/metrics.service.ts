import { Injectable } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Histogram,
  Counter,
  Gauge,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry: Registry;

  // Latency metrics
  public readonly quoteLatency: Histogram;
  public readonly httpRequestDuration: Histogram;

  // Success / Failure counters
  public readonly swapSuccessTotal: Counter;
  public readonly swapFailureTotal: Counter;
  public readonly bridgeSuccessTotal: Counter;
  public readonly bridgeFailureTotal: Counter;
  public readonly offrampSuccessTotal: Counter;
  public readonly offrampFailureTotal: Counter;

  // HTTP metrics
  public readonly httpRequestsTotal: Counter;

  // Active orders gauge
  public readonly activeOrders: Gauge;

  constructor() {
    this.registry = new Registry();

    // Default system metrics (CPU, memory, event loop lag, etc.)
    collectDefaultMetrics({ register: this.registry, prefix: 'lumenflow_' });

    this.quoteLatency = new Histogram({
      name: 'lumenflow_quote_latency_seconds',
      help: 'Latency of quote generation across swap, bridge, and offramp',
      labelNames: ['type'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'lumenflow_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.swapSuccessTotal = new Counter({
      name: 'lumenflow_swap_success_total',
      help: 'Total successfully executed swaps',
      registers: [this.registry],
    });

    this.swapFailureTotal = new Counter({
      name: 'lumenflow_swap_failure_total',
      help: 'Total failed swap submissions or builds',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.bridgeSuccessTotal = new Counter({
      name: 'lumenflow_bridge_success_total',
      help: 'Total completed cross-chain bridge transfers',
      labelNames: ['provider', 'route'],
      registers: [this.registry],
    });

    this.bridgeFailureTotal = new Counter({
      name: 'lumenflow_bridge_failure_total',
      help: 'Total failed cross-chain bridge transfers',
      labelNames: ['provider', 'route', 'reason'],
      registers: [this.registry],
    });

    this.offrampSuccessTotal = new Counter({
      name: 'lumenflow_offramp_success_total',
      help: 'Total successfully completed offramp orders',
      labelNames: ['currency'],
      registers: [this.registry],
    });

    this.offrampFailureTotal = new Counter({
      name: 'lumenflow_offramp_failure_total',
      help: 'Total failed offramp orders or payouts',
      labelNames: ['currency', 'reason'],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'lumenflow_http_requests_total',
      help: 'Total number of HTTP requests handled',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.activeOrders = new Gauge({
      name: 'lumenflow_active_orders',
      help: 'Current active orders in flight by state',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
