import {
  type KycAdapter,
  type KycCustomer,
  type KycStatus,
  type KycTier,
} from '@lumenflow/shared-types';

export interface HttpKycAdapterConfig {
  name: string;
  apiUrl: string;
  apiKey: string;
  partnerId?: string;
  callbackUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  defaultTier?: KycTier;
}

interface ProviderCustomerResponse {
  id: string;
  userId: string;
  status: string;
  tier?: number;
  verifiedAt?: string;
  flags?: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapStatus(providerStatus: string): KycStatus {
  const s = providerStatus.toLowerCase();
  if (s === 'verified' || s === 'approved' || s === 'complete' || s === 'completed') return 'VERIFIED';
  if (s === 'rejected' || s === 'failed' || s === 'declined') return 'REJECTED';
  if (s === 'pending' || s === 'in_review') return 'PENDING';
  return 'NOT_STARTED';
}

export class HttpKycAdapter implements KycAdapter {
  readonly name: string;
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly partnerId: string | undefined;
  private readonly callbackUrl: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly defaultTier: KycTier;

  constructor(config: HttpKycAdapterConfig) {
    this.name = config.name;
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.partnerId = config.partnerId;
    this.callbackUrl = config.callbackUrl;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.defaultTier = config.defaultTier ?? 1;
  }

  async getCustomerStatus(userId: string): Promise<KycCustomer> {
    const data = await this.request<ProviderCustomerResponse>(
      'GET',
      `/customers/${encodeURIComponent(userId)}`,
    );

    return {
      id: data.id,
      userId: data.userId ?? userId,
      tier: (data.tier ?? this.defaultTier) as KycTier,
      status: mapStatus(data.status),
      verifiedAt: data.verifiedAt,
      flags: data.flags,
    };
  }

  async submitVerification(
    userId: string,
    verificationData: Record<string, unknown>,
  ): Promise<KycCustomer> {
    const body: Record<string, unknown> = { userId, ...verificationData };
    if (this.partnerId !== undefined) body['partnerId'] = this.partnerId;
    if (this.callbackUrl !== undefined) body['callbackUrl'] = this.callbackUrl;

    const result = await this.request<ProviderCustomerResponse>(
      'POST',
      '/customers/verify',
      body,
    );

    let tier: KycTier = this.defaultTier;
    if (verificationData['id_number'] || verificationData['national_id']) tier = 2;
    if (verificationData['passport_number'] || verificationData['biometric']) tier = 3;
    if (result.tier !== undefined) tier = result.tier as KycTier;

    return {
      id: result.id,
      userId: result.userId ?? userId,
      tier,
      status: mapStatus(result.status),
      verifiedAt: result.verifiedAt,
      flags: result.flags,
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

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        };
        if (this.partnerId !== undefined) headers['X-Partner-Id'] = this.partnerId;

        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) init.body = JSON.stringify(body);

        const res = await fetch(`${this.apiUrl}${path}`, init);
        clearTimeout(timeout);

        if (!res.ok) {
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            const text = await res.text().catch(() => 'Unknown error');
            throw new Error(`KYC API ${res.status}: ${text}`);
          }
          throw new Error(`KYC API returned ${res.status}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes('KYC API 40') && !lastError.message.includes('429')) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('KYC request failed after all retries');
  }
}
