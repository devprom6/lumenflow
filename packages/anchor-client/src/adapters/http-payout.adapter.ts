/**
 * HTTP-based Payout Adapter
 *
 * Implements the PayoutAdapter interface against real third-party payout
 * provider REST APIs (e.g. Paystack, Flutterwave, direct bank integrations).
 * Supports bank transfers and mobile money disbursements.
 */

import {
  type PayoutAdapter,
  type PayoutParams,
  type PayoutResult,
  type PayoutStatus,
} from '@lumenflow/shared-types';

export interface HttpPayoutAdapterConfig {
  /** Provider name (e.g. "Paystack", "Flutterwave") */
  name: string;
  /** Base URL of the payout provider API */
  apiUrl: string;
  /** Secret key for authentication */
  secretKey: string;
  /** Request timeout in ms (default 15 000) */
  timeoutMs?: number;
  /** Max retries for transient failures (default 3) */
  maxRetries?: number;
  /** Default fee for payouts (used as fallback) */
  defaultFee?: string;
}

interface ProviderPayoutResponse {
  payoutId: string;
  status: string;
  reference?: string;
  fee?: string;
  message?: string;
}

interface ProviderPayoutStatusResponse {
  payoutId: string;
  status: string;
  reference?: string;
  fee?: string;
  message?: string;
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
    // Build provider-specific request body
    const body: Record<string, unknown> = {
      reference: params.orderId,
      amount: params.amount,
      currency: params.currency,
      // Bank transfer fields
      bank_name: params.recipient.bankName,
      account_number: params.recipient.accountNumber,
      account_name: params.recipient.accountName,
      // Mobile money fields
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
    const data = await this.request<ProviderPayoutStatusResponse>(
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

        const res = await fetch(`${this.apiUrl}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.secretKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

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
