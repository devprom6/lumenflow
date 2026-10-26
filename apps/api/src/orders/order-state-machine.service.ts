import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  isLegalTransition,
  type OrderStatus,
} from '@lumenflow/shared-types';
import { PrismaService } from '../database/prisma.service';
import { IllegalTransitionException } from './errors/illegal-transition.error';

export interface TransitionOptions {
  reason?: string;
  metadata?: Record<string, unknown>;
  stellarTxHash?: string;
  externalId?: string;
}

export interface InMemoryOrder {
  id: string;
  userId: string;
  type: string;
  status: OrderStatus;
  sourceAsset: unknown;
  destinationAsset: unknown;
  sourceAmount: string;
  destinationAmount?: string;
  quoteId?: string;
  stellarTxHash?: string;
  externalId?: string;
  createdAt: Date;
  updatedAt: Date;
  events: Array<{
    id: string;
    orderId: string;
    fromStatus: string | null;
    toStatus: string;
    reason?: string | undefined;
    metadata?: unknown;
    createdAt: Date;
  }>;
}

@Injectable()
export class OrderStateMachineService {
  private readonly logger = new Logger(OrderStateMachineService.name);
  // In-memory fallback map for test environments where Postgres is not running
  private readonly inMemoryOrders = new Map<string, InMemoryOrder>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register an in-memory order for testing or disconnected environments
   */
  setInMemoryOrder(order: InMemoryOrder): void {
    this.inMemoryOrders.set(order.id, order);
  }

  getInMemoryOrder(orderId: string): InMemoryOrder | undefined {
    return this.inMemoryOrders.get(orderId);
  }

  /**
   * Enforces legal transitions and atomically updates order state + writes append-only order_events row.
   */
  async transition(
    orderId: string,
    toStatus: OrderStatus,
    options: TransitionOptions = {},
  ): Promise<{ id: string; status: OrderStatus; previousStatus: OrderStatus }> {
    // 1. Check in-memory store first (for unit/integration tests without live DB)
    const memOrder = this.inMemoryOrders.get(orderId);
    if (memOrder) {
      const fromStatus = memOrder.status;
      if (!isLegalTransition(fromStatus, toStatus)) {
        throw new IllegalTransitionException(fromStatus, toStatus);
      }

      memOrder.status = toStatus;
      memOrder.updatedAt = new Date();
      if (options.stellarTxHash) memOrder.stellarTxHash = options.stellarTxHash;
      if (options.externalId) memOrder.externalId = options.externalId;

      memOrder.events.push({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        orderId,
        fromStatus,
        toStatus,
        reason: options.reason,
        metadata: options.metadata,
        createdAt: new Date(),
      });

      this.logger.log(`Order ${orderId} transitioned: ${fromStatus} -> ${toStatus}`);
      return { id: orderId, status: toStatus, previousStatus: fromStatus };
    }

    // 2. Database transaction
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
        });

        if (!order) {
          throw new NotFoundException(`Order with id '${orderId}' not found.`);
        }

        const fromStatus = order.status as OrderStatus;
        if (!isLegalTransition(fromStatus, toStatus)) {
          throw new IllegalTransitionException(fromStatus, toStatus);
        }

        // Atomically update order status
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: toStatus,
            ...(options.stellarTxHash ? { stellarTxHash: options.stellarTxHash } : {}),
            ...(options.externalId ? { externalId: options.externalId } : {}),
          },
        });

        // Atomically append order_events row (APPEND-ONLY)
        await tx.orderEvent.create({
          data: {
            orderId,
            fromStatus,
            toStatus,
            reason: options.reason ?? null,
            metadata: (options.metadata as Record<string, string>) ?? undefined,
          },
        });

        this.logger.log(`Order ${orderId} transitioned: ${fromStatus} -> ${toStatus}`);
        return { id: orderId, status: toStatus, previousStatus: fromStatus };
      });
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof IllegalTransitionException
      ) {
        throw err;
      }
      this.logger.error(`Failed to transition order ${orderId}: ${String(err)}`);
      throw err;
    }
  }
}
