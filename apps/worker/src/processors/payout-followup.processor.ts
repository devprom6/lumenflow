import type { AlertHook } from '../alerts/alert-hook.interface';
import type { OrderStateUpdater } from './bridge-status.processor';

export interface PayoutFollowupJobData {
  orderId: string;
  externalId: string;
  provider: string; // 'anchor' | 'payout'
  submittedAt: number;
  expectedDurationMs?: number | undefined;
}

export class PayoutFollowupProcessor {
  constructor(
    private readonly orderUpdater: OrderStateUpdater,
    private readonly alertHook: AlertHook,
    private readonly defaultThresholdMs = 900_000, // 15 minutes default
  ) {}

  public async process(data: PayoutFollowupJobData): Promise<{
    orderId: string;
    actionTaken: string;
    alertSent: boolean;
  }> {
    const order = await this.orderUpdater.getOrder(data.orderId);
    if (!order) {
      return { orderId: data.orderId, actionTaken: 'ORDER_NOT_FOUND', alertSent: false };
    }

    if (order.status === 'COMPLETED' || order.status === 'FAILED' || order.status === 'EXPIRED') {
      return { orderId: data.orderId, actionTaken: 'ALREADY_TERMINAL', alertSent: false };
    }

    const elapsedMs = Date.now() - data.submittedAt;
    const thresholdMs = data.expectedDurationMs ?? this.defaultThresholdMs;

    let alertSent = false;
    if (elapsedMs > thresholdMs) {
      await this.alertHook.sendAlert({
        type: 'PAYOUT_DELAY',
        severity: 'WARNING',
        title: `Payout/Anchor follow-up delay exceeded threshold: ${data.orderId}`,
        details: {
          orderId: data.orderId,
          externalId: data.externalId,
          provider: data.provider,
          elapsedSeconds: Math.round(elapsedMs / 1000),
          thresholdSeconds: Math.round(thresholdMs / 1000),
          currentStatus: order.status,
        },
        timestamp: new Date().toISOString(),
      });
      alertSent = true;
    }

    return {
      orderId: data.orderId,
      actionTaken: alertSent ? 'ALERTED_DELAY' : 'FOLLOWUP_OK',
      alertSent,
    };
  }
}
