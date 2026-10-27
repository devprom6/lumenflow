import type { BridgeAdapter, TransferStatus } from '@lumenflow/shared-types';
import type { AlertHook } from '../alerts/alert-hook.interface';

export interface BridgeStatusJobData {
  orderId: string;
  transferId: string;
  provider: string;
  submittedAt: number;
  expectedDurationMs?: number | undefined;
}

export interface OrderStateUpdater {
  getOrder(orderId: string): Promise<{ id: string; status: string } | null>;
  transitionOrder(
    orderId: string,
    toStatus: string,
    options?: { reason?: string | undefined; txHash?: string | undefined },
  ): Promise<void>;
}

export class BridgeStatusProcessor {
  constructor(
    private readonly adapter: BridgeAdapter,
    private readonly orderUpdater: OrderStateUpdater,
    private readonly alertHook: AlertHook,
    private readonly defaultExpectedDurationMs = 300_000, // 5 minutes default
  ) {}

  public async process(data: BridgeStatusJobData): Promise<{
    orderId: string;
    transferStatus: TransferStatus;
    actionTaken: string;
    isStuck: boolean;
  }> {
    const order = await this.orderUpdater.getOrder(data.orderId);
    if (!order) {
      return {
        orderId: data.orderId,
        transferStatus: {
          transferId: data.transferId,
          provider: data.provider,
          status: 'FAILED',
          message: 'Order not found',
          updatedAt: new Date().toISOString(),
        },
        actionTaken: 'ORDER_NOT_FOUND',
        isStuck: false,
      };
    }

    // Already terminal
    if (order.status === 'COMPLETED' || order.status === 'FAILED' || order.status === 'EXPIRED') {
      return {
        orderId: data.orderId,
        transferStatus: {
          transferId: data.transferId,
          provider: data.provider,
          status: order.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
          updatedAt: new Date().toISOString(),
        },
        actionTaken: 'ALREADY_TERMINAL',
        isStuck: false,
      };
    }

    const transferStatus = await this.adapter.getStatus(data.transferId);
    const elapsedMs = Date.now() - data.submittedAt;
    const thresholdMs = data.expectedDurationMs ?? this.defaultExpectedDurationMs;

    const isStuck = transferStatus.isStuck === true || transferStatus.status === 'STUCK' || elapsedMs > thresholdMs;

    // Check stuck transfer detection
    if (isStuck) {
      await this.alertHook.sendAlert({
        type: 'STUCK_TRANSFER',
        severity: 'CRITICAL',
        title: `Bridge transfer stuck: ${data.transferId} on ${data.provider}`,
        details: {
          orderId: data.orderId,
          transferId: data.transferId,
          provider: data.provider,
          elapsedSeconds: Math.round(elapsedMs / 1000),
          thresholdSeconds: Math.round(thresholdMs / 1000),
          adapterStatus: transferStatus.status,
          message: transferStatus.message ?? 'Exceeded expected duration SLA',
        },
        timestamp: new Date().toISOString(),
      });
    }

    let actionTaken = 'NOOP';

    if (transferStatus.status === 'COMPLETED') {
      if (order.status !== 'COMPLETED') {
        if (order.status === 'AWAITING_SIGNATURE') {
          await this.orderUpdater.transitionOrder(data.orderId, 'SUBMITTED', {
            txHash: transferStatus.fromTxHash,
          });
          await this.orderUpdater.transitionOrder(data.orderId, 'PROCESSING');
        } else if (order.status === 'SUBMITTED') {
          await this.orderUpdater.transitionOrder(data.orderId, 'PROCESSING');
        }
        await this.orderUpdater.transitionOrder(data.orderId, 'COMPLETED', {
          reason: `Bridge transfer confirmed on destination chain (${transferStatus.toTxHash ?? 'confirmed'})`,
          txHash: transferStatus.toTxHash,
        });
        actionTaken = 'TRANSITIONED_TO_COMPLETED';
      }
    } else if (transferStatus.status === 'FAILED') {
      if (order.status !== 'FAILED') {
        await this.orderUpdater.transitionOrder(data.orderId, 'FAILED', {
          reason: transferStatus.message ?? 'Bridge transfer failed',
        });
        actionTaken = 'TRANSITIONED_TO_FAILED';
      }
    } else if (transferStatus.status === 'IN_FLIGHT') {
      if (order.status === 'AWAITING_SIGNATURE') {
        await this.orderUpdater.transitionOrder(data.orderId, 'SUBMITTED', {
          txHash: transferStatus.fromTxHash,
        });
        await this.orderUpdater.transitionOrder(data.orderId, 'PROCESSING', {
          reason: 'Bridge transfer in flight',
        });
        actionTaken = 'TRANSITIONED_TO_PROCESSING';
      } else if (order.status === 'SUBMITTED') {
        await this.orderUpdater.transitionOrder(data.orderId, 'PROCESSING', {
          reason: 'Bridge transfer in flight',
        });
        actionTaken = 'TRANSITIONED_TO_PROCESSING';
      }
    }

    return {
      orderId: data.orderId,
      transferStatus,
      actionTaken,
      isStuck,
    };
  }
}
