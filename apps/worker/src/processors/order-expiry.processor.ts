import type { OrderStateUpdater } from './bridge-status.processor';

export interface ExpirableOrder {
  id: string;
  status: string;
  expiresAt: string | Date;
}

export interface ExpirableQuote {
  id: string;
  expiresAt: string | Date;
}

export interface ExpiryStore {
  getPendingOrders(): Promise<ExpirableOrder[]>;
  getPendingQuotes(): Promise<ExpirableQuote[]>;
  markQuoteExpired(quoteId: string): Promise<void>;
}

export class OrderExpiryProcessor {
  constructor(
    private readonly store: ExpiryStore,
    private readonly orderUpdater: OrderStateUpdater,
  ) {}

  public async process(): Promise<{
    expiredOrdersCount: number;
    expiredQuotesCount: number;
    expiredOrderIds: string[];
  }> {
    const now = Date.now();
    const pendingOrders = await this.store.getPendingOrders();
    const expiredOrderIds: string[] = [];

    for (const order of pendingOrders) {
      if (order.status === 'COMPLETED' || order.status === 'FAILED' || order.status === 'EXPIRED') {
        continue;
      }

      const expiryTime = new Date(order.expiresAt).getTime();
      if (expiryTime <= now) {
        if (
          order.status === 'CREATED' ||
          order.status === 'QUOTED' ||
          order.status === 'AWAITING_SIGNATURE'
        ) {
          try {
            await this.orderUpdater.transitionOrder(order.id, 'EXPIRED', {
              reason: 'Order expired before transaction signing',
            });
            expiredOrderIds.push(order.id);
          } catch {
            // Already transitioned or locked
          }
        }
      }
    }

    const pendingQuotes = await this.store.getPendingQuotes();
    let expiredQuotesCount = 0;
    for (const quote of pendingQuotes) {
      const quoteExpiry = new Date(quote.expiresAt).getTime();
      if (quoteExpiry <= now) {
        await this.store.markQuoteExpired(quote.id);
        expiredQuotesCount++;
      }
    }

    return {
      expiredOrdersCount: expiredOrderIds.length,
      expiredQuotesCount,
      expiredOrderIds,
    };
  }
}
