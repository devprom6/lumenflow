import {
  type BridgeAdapter,
  type BridgeRoute,
  type QuoteParams,
  type BridgeQuote,
  type UnsignedTransfer,
  type TransferStatus,
} from '@lumenflow/shared-types';

export interface HttpBridgeAdapterConfig {
  name: string;
  apiUrl: string;
  apiKey: string;
  routes?: BridgeRoute[];
  timeoutMs?: number;
  maxRetries?: number;
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

// Raw route shape returned by the provider API
interface ProviderRoute {
  id?: string;
  fromChain?: string;
  source_chain?: string;
  toChain?: string;
  destination_chain?: string;
  fromAsset?: string;
  source_asset?: string;
  toAsset?: string;
  destination_asset?: string;
  minAmount?: string;
  min_amount?: string;
  maxAmount?: string;
  max_amount?: string;
  estimatedDurationSeconds?: number;
  estimated_duration_seconds?: number;
  enabled?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      const res = await this.rawRequest('GET', '/health');
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
      const data = await this.request<ProviderRoute[]>('GET', '/routes');
      this.cachedRoutes = data.map((r) => ({
        id: r.id ?? `${r.fromChain ?? r.source_chain}-${r.toChain ?? r.destination_chain}-${r.fromAsset ?? r.source_asset}`,
        fromChain: r.fromChain ?? r.source_chain ?? '',
        toChain: r.toChain ?? r.destination_chain ?? '',
        fromAsset: r.fromAsset ?? r.source_asset ?? '',
        toAsset: r.toAsset ?? r.destination_asset ?? '',
        minAmount: r.minAmount ?? r.min_amount ?? '1.0',
        maxAmount: r.maxAmount ?? r.max_amount ?? '1000000.0',
        estimatedDurationSeconds: r.estimatedDurationSeconds ?? r.estimated_duration_seconds ?? 300,
        enabled: r.enabled ?? true,
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

  async buildTransfer(quote: BridgeQuote, sender: string): Promise<UnsignedTransfer> {
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
    const isStuck = mappedStatus === 'PENDING' && elapsed > 600_000;

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

  // Returns raw Response — used only for health checks where we need res.ok
  private async rawRequest(method: string, path: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

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

        // Only include body for non-GET requests
        const init: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        };
        if (body !== undefined) {
          init.body = JSON.stringify(body);
        }

        const res = await fetch(`${this.apiUrl}${path}`, init);
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
