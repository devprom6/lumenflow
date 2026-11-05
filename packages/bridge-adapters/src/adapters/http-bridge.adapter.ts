/**
 * HTTP-based Bridge Adapter
 *
 * Implements the BridgeAdapter interface against real third-party bridge
 * provider REST APIs.  The adapter is provider-agnostic: configure the base
 * URL, API key, and supported routes via the constructor config object.
 *
 * This adapter follows the pattern documented in docs/providers.md — it
 * performs real HTTP calls to the provider's quote, transfer, and status
 * endpoints, maps responses to the shared LumenFlow types, and handles
 * retries with exponential backoff.
 */

import {
  type BridgeAdapter,
  type BridgeRoute,
  type QuoteParams,
  type BridgeQuote,
  type UnsignedTransfer,
  type TransferStatus,
} from '@lumenflow/shared-types';

// ── Types ────────────────────────────────────────────────────────────────

export interface HttpBridgeAdapterConfig {
  /** Provider name shown in quotes/logs (e.g. "Allbridge", "Wormhole") */
  name: string;
  /** Base URL of the bridge provider API */
  apiUrl: string;
  /** API key or bearer token for authentication */
  apiKey: string;
  /** Optional list of supported routes (fetched from API if omitted) */
  routes?: BridgeRoute[];
  /** Request timeout in ms (default 10 000) */
  timeoutMs?: number;
  /** Max retries for transient failures (default 3) */
  maxRetries?: number;
  /** Fee percentage the bridge charges (used as fallback if API doesn't return fee) */
  feePercent?: number;
}

interface ProviderQuoteResponse {
  quoteId: string;
  fromAmount: string;
  toAmount: string;
  fee: { amount: string; asset: string };
  rate: string;
  estimatedDurationSeconds: number;
  expiresAt: string;
}

interface ProviderTransferResponse {
  transferId: string;
  unsignedTransaction: string;
  depositAddress?: string;
  memo?: string;
  networkPassphrase?: string;
}

interface ProviderStatusResponse {
  transferId: string;
  status: string;
  fromTxHash?: string;
  toTxHash?: string;
  confirmations?: number;
  requiredConfirmations?: number;
  message?: string;
}

// ── Utility ──────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Adapter ──────────────────────────────────────────────────────────────

export class HttpBridgeAdapter implements BridgeAdapter {
  readonly name: string;
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly feePercent: number;
  private cachedRoutes: BridgeRoute[] | undefined;
  private readonly transferStartTimes = new Map<string, number>();

  constructor(config: HttpBridgeAdapterConfig) {
    this.name = config.name;
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.feePercent = config.feePercent ?? 0.003;
    this.cachedRoutes = config.routes;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/health');
      return res.ok;
    } catch {
      return false;
    }
  }

  async getSupportedRoutes(): Promise<BridgeRoute[]> {
    if (this.cachedRoutes && this.cachedRoutes.length > 0) {
      return this.cachedRoutes;
    }

    try {
      const data = await this.request<unknown[]>('GET', '/routes');
      this.cachedRoutes = data.map((r: Record<string, unknown>) => ({
        id: String(r['id'] ?? `${r['fromChain']}-${r['toChain']}-${r['fromAsset']}`),
        fromChain: String(r['fromChain'] ?? r['source_chain']),
        toChain: String(r['toChain'] ?? r['destination_chain']),
        fromAsset: String(r['fromAsset'] ?? r['source_asset']),
        toAsset: String(r['toAsset'] ?? r['destination_asset']),
        minAmount: String(r['minAmount'] ?? r['min_amount'] ?? '1.0'),
        maxAmount: String(r['maxAmount'] ?? r['max_amount'] ?? '1000000.0'),
        estimatedDurationSeconds: Number(r['estimatedDurationSeconds'] ?? r['estimated_duration_seconds'] ?? 300),
        enabled: Boolean(r['enabled'] ?? true),
      }));
      return this.cachedRoutes;
    } catch {
      return [];
    }
  }

  async getQuote(params: QuoteParams): Promise<BridgeQuote> {
    const data = await this.request<ProviderQuoteResponse>('POST', '/quote', {
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromAsset: params.fromAsset,
      toAsset: params.toAsset,
      amount: params.amount,
      slippageTolerance: params.slippageTolerance ?? 0.005,
    });

    const now = new Date();
    const expiresAt = data.expiresAt
      ? new Date(data.expiresAt)
      : new Date(now.getTime() + 120_000);

    return {
      id: data.quoteId,
      provider: this.name,
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromAsset: params.fromAsset,
      toAsset: params.toAsset,
      fromAmount: params.amount,
      toAmount: data.toAmount,
      estimatedDurationSeconds: data.estimatedDurationSeconds,
      fee: data.fee ?? {
        amount: (parseFloat(params.amount) * this.feePercent).toFixed(7),
        asset: params.fromAsset,
      },
      rate: data.rate ?? '1.0000',
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };
  }

  async buildTransfer(
    quote: BridgeQuote,
    sender: string,
  ): Promise<UnsignedTransfer> {
    const data = await this.request<ProviderTransferResponse>('POST', '/transfer', {
      quoteId: quote.id,
      sender,
      fromChain: quote.fromChain,
      toChain: quote.toChain,
      fromAsset: quote.fromAsset,
      toAsset: quote.toAsset,
      amount: quote.fromAmount,
    });

    this.transferStartTimes.set(data.transferId, Date.now());

    return {
      transferId: data.transferId,
      provider: this.name,
      fromChain: quote.fromChain,
      toChain: quote.toChain,
      unsignedTransaction: data.unsignedTransaction,
      sender,
      depositAddress: data.depositAddress,
      memo: data.memo,
      networkPassphrase: data.networkPassphrase,
    };
  }

  async getStatus(transferId: string): Promise<TransferStatus> {
    const data = await this.request<ProviderStatusResponse>(
      'GET',
      `/transfer/${transferId}/status`,
    );

    const statusUpper = data.status.toUpperCase();
    let mappedStatus: TransferStatus['status'];

    if (statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS') {
      mappedStatus = 'COMPLETED';
    } else if (statusUpper === 'FAILED' || statusUpper === 'ERROR') {
      mappedStatus = 'FAILED';
    } else if (statusUpper === 'STUCK' || statusUpper === 'STALLED') {
      mappedStatus = 'STUCK';
    } else if (statusUpper === 'IN_FLIGHT' || statusUpper === 'IN_TRANSIT') {
      mappedStatus = 'IN_FLIGHT';
    } else {
      mappedStatus = 'PENDING';
    }

    const startTime = this.transferStartTimes.get(transferId);
    const elapsed = startTime ? Date.now() - startTime : 0;
    const isStuck =
      mappedStatus === 'PENDING' && elapsed > 600_000;

    return {
      transferId: data.transferId,
      provider: this.name,
      status: isStuck ? 'STUCK' : mappedStatus,
      fromTxHash: data.fromTxHash,
      toTxHash: data.toTxHash,
      confirmations: data.confirmations,
      requiredConfirmations: data.requiredConfirmations,
      message: data.message,
      isStuck,
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Internal HTTP helper with retry ────────────────────────────────────
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const res = await fetch(`${this.apiUrl}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            const text = await res.text().catch(() => 'Unknown error');
            throw new Error(`Bridge API ${res.status}: ${text}`);
          }
          throw new Error(`Bridge API returned ${res.status}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (
          lastError.message.includes('Bridge API 40') &&
          !lastError.message.includes('429')
        ) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Bridge request failed after all retries');
  }
}
