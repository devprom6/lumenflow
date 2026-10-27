import {
  type PayoutAdapter,
  type PayoutParams,
  type PayoutResult,
  type PayoutStatus,
} from '@lumenflow/shared-types';

export interface MockPayoutAdapterConfig {
  defaultStatus?: PayoutStatus;
  simulateFailure?: boolean;
  failureReason?: string;
  fixedFee?: string;
  simulateDelayMs?: number;
}

export class MockPayoutAdapter implements PayoutAdapter {
  readonly name = 'MockPayoutAdapter';
  private readonly payouts = new Map<string, PayoutResult>();
  private defaultStatus: PayoutStatus;
  private simulateFailure: boolean;
  private failureReason: string;
  private fixedFee: string;
  private simulateDelayMs: number;

  constructor(config: MockPayoutAdapterConfig = {}) {
    this.defaultStatus = config.defaultStatus ?? 'COMPLETED';
    this.simulateFailure = config.simulateFailure ?? false;
    this.failureReason = config.failureReason ?? 'Bank network timeout';
    this.fixedFee = config.fixedFee ?? '1.50';
    this.simulateDelayMs = config.simulateDelayMs ?? 0;
  }

  setSimulateFailure(fail: boolean, reason?: string): void {
    this.simulateFailure = fail;
    if (reason) this.failureReason = reason;
  }

  setDefaultStatus(status: PayoutStatus): void {
    this.defaultStatus = status;
  }

  setPayout(payoutId: string, result: PayoutResult): void {
    this.payouts.set(payoutId, result);
  }

  async initiatePayout(params: PayoutParams): Promise<PayoutResult> {
    if (this.simulateDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateDelayMs));
    }

    const payoutId = `payout-${params.orderId}-${Date.now()}`;

    if (this.simulateFailure) {
      const failedResult: PayoutResult = {
        payoutId,
        status: 'FAILED',
        externalReference: `ext-fail-${Date.now()}`,
        fee: this.fixedFee,
      };
      this.payouts.set(payoutId, failedResult);
      throw new Error(`Payout failed: ${this.failureReason}`);
    }

    const result: PayoutResult = {
      payoutId,
      status: this.defaultStatus,
      externalReference: `ext-${Date.now()}`,
      fee: this.fixedFee,
    };

    this.payouts.set(payoutId, result);
    return result;
  }

  async getPayoutStatus(payoutId: string): Promise<PayoutResult> {
    if (this.simulateDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateDelayMs));
    }

    const payout = this.payouts.get(payoutId);
    if (!payout) {
      return {
        payoutId,
        status: 'FAILED',
        fee: '0',
      };
    }

    return payout;
  }
}
