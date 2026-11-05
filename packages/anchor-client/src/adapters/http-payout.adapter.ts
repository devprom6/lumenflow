import {
  type PayoutAdapter,
  type PayoutParams,
  type PayoutResult,
  type PayoutStatus,
} from '@lumenflow/shared-types';

export interface HttpPayoutAdapterConfig {
  name: string;
  apiUrl: string;
  secretKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  defaultFee?: string;
}

interface ProviderPayoutResponse {
  payoutId: string;
  status: string;
  reference?: string;
  fee?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapPayoutStatus(providerStatus: string): PayoutStatus {
  const s = providerStatus.toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'successful' || s === 'settled') return 'COMPLETED';
  if (s === 'failed' || s === 'error' || s === 'declined' || s === 'reversed') return 'FAILED';
  if (s === 'processing' || s === 'in_progress' || s === 'pending') return 'PROCESSING';
  return 'INITIATED';
}

export class HttpPayoutAdapter implements PayoutAdapter {
  readonly name: string;
  private readonly apiUrl: string;
  private readonly secretKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly defaultFee: string;

  constructor(config: HttpPayoutAdapterConfig) {
    this.name = config.name;
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.secretKey = config.secretKey;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.defaultFee = config.defaultFee ?? '1.50';
  }

  async initiatePayout(params: PayoutParams): Promise<PayoutResult> {
    const body: Record<string, unknown> = {
      reference: params.orderId,
      amount: params.amount,
      currency: params.currency,
      bank_name: params.recipient.bankName,
      account_number: params.recipient.accountNumber,
      account_name: params.recipient.accountName,
      phone: params.recipient.phone,
      memo: params.memo,
    };

    const data = await this.request<ProviderPayoutResponse>('POST', '/payouts/initiate', body);

    return {
      payoutId: data.payoutId,
      status: mapPayoutStatus(data.status),
      externalReference: data.reference,
      fee: data.fee ?? this.defaultFee,
    };
  }

  async getPayoutStatus(payoutId: string): Promise<PayoutResult> {
    const data = await this.request<ProviderPayoutResponse>(
      'GET',
      `/payouts/${encodeURIComponent(payoutId)}/status`,
    );

    return {
      payoutId: data.payoutId,
      status: mapPayoutStatus(data.status),
      externalReference: data.reference,
      fee: data.fee ?? this.defaultFee,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const init: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.secretKey}`,
          },
          signal: controller.signal,
        };
        if (body !== undefined) init.body = JSON.stringify(body);

        const res = await fetch(`${this.apiUrl}${path}`, init);
        clearTimeout(timeout);

        if (!res.ok) {
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            const text = await res.text().catch(() => 'Unknown error');
            throw new Error(`Payout API ${res.status}: ${text}`);
          }
          throw new Error(`Payout API returned ${res.status}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (
          lastError.message.includes('Payout API 40') &&
          !lastError.message.includes('429')
        ) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Payout request failed after all retries');
  }
}
