import {
  type KycAdapter,
  type KycCustomer,
  type KycStatus,
  type KycTier,
} from '@lumenflow/shared-types';

export interface MockKycAdapterConfig {
  autoApprove?: boolean;
  defaultTier?: KycTier;
  simulateDelayMs?: number;
}

export class MockKycAdapter implements KycAdapter {
  readonly name = 'MockKycAdapter';
  private readonly customers = new Map<string, KycCustomer>();
  private autoApprove: boolean;
  private defaultTier: KycTier;
  private simulateDelayMs: number;

  constructor(config: MockKycAdapterConfig = {}) {
    this.autoApprove = config.autoApprove ?? true;
    this.defaultTier = config.defaultTier ?? 1;
    this.simulateDelayMs = config.simulateDelayMs ?? 0;
  }

  setCustomer(customer: KycCustomer): void {
    this.customers.set(customer.userId, customer);
  }

  setTier(userId: string, tier: KycTier): void {
    const existing = this.customers.get(userId);
    if (existing) {
      existing.tier = tier;
    } else {
      this.customers.set(userId, {
        id: `mock-kyc-${userId}`,
        userId,
        tier,
        status: 'VERIFIED',
        verifiedAt: new Date().toISOString(),
      });
    }
  }

  setStatus(userId: string, status: KycStatus): void {
    const existing = this.customers.get(userId);
    if (existing) {
      existing.status = status;
    }
  }

  async getCustomerStatus(userId: string): Promise<KycCustomer> {
    if (this.simulateDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateDelayMs));
    }

    const customer = this.customers.get(userId);
    if (customer) {
      return customer;
    }

    // Default unverified / tier 1 mock
    const created: KycCustomer = {
      id: `mock-kyc-${userId}`,
      userId,
      tier: this.defaultTier,
      status: this.autoApprove ? 'VERIFIED' : 'PENDING',
      verifiedAt: this.autoApprove ? new Date().toISOString() : undefined,
    };
    this.customers.set(userId, created);
    return created;
  }

  async submitVerification(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<KycCustomer> {
    if (this.simulateDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateDelayMs));
    }

    const current = await this.getCustomerStatus(userId);
    // If id_number or national ID provided, upgrade tier
    const upgradedTier: KycTier = data['id_number'] ? 2 : current.tier;

    const updated: KycCustomer = {
      ...current,
      tier: upgradedTier,
      status: this.autoApprove ? 'VERIFIED' : 'PENDING',
      verifiedAt: this.autoApprove ? new Date().toISOString() : undefined,
    };

    this.customers.set(userId, updated);
    return updated;
  }
}
