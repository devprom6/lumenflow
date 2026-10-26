import { describe, it, expect, beforeEach } from 'vitest';
import { OrderStateMachineService, InMemoryOrder } from '../order-state-machine.service';
import { PrismaService } from '../../database/prisma.service';
import { IllegalTransitionException } from '../errors/illegal-transition.error';
import {
  LEGAL_TRANSITIONS,
  OrderStatusSchema,
  type OrderStatus,
} from '@lumenflow/shared-types';

describe('OrderStateMachineService', () => {
  let service: OrderStateMachineService;
  const ALL_STATUSES = OrderStatusSchema.options;

  beforeEach(() => {
    const prisma = new PrismaService();
    service = new OrderStateMachineService(prisma);
  });

  function createTestOrder(id: string, initialStatus: OrderStatus): InMemoryOrder {
    const order: InMemoryOrder = {
      id,
      userId: 'usr-1',
      type: 'SWAP',
      status: initialStatus,
      sourceAsset: { type: 'native', code: 'XLM' },
      destinationAsset: { type: 'credit_alphanum4', code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      sourceAmount: '10.0',
      destinationAmount: '1.2',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [
        {
          id: 'init-evt',
          orderId: id,
          fromStatus: null,
          toStatus: initialStatus,
          createdAt: new Date(),
        },
      ],
    };
    service.setInMemoryOrder(order);
    return order;
  }

  describe('Legal Transitions', () => {
    for (const [from, allowedList] of Object.entries(LEGAL_TRANSITIONS) as Array<[OrderStatus, OrderStatus[]]>) {
      for (const to of allowedList) {
        it(`permits transition: ${from} -> ${to} and appends order_events`, async () => {
          const orderId = `order-${from}-${to}`;
          const order = createTestOrder(orderId, from);

          const result = await service.transition(orderId, to, {
            reason: `Testing ${from} to ${to}`,
            metadata: { step: 'automated-test' },
          });

          expect(result.status).toBe(to);
          expect(result.previousStatus).toBe(from);
          expect(order.status).toBe(to);

          const lastEvent = order.events[order.events.length - 1];
          expect(lastEvent).toBeDefined();
          expect(lastEvent?.fromStatus).toBe(from);
          expect(lastEvent?.toStatus).toBe(to);
          expect(lastEvent?.reason).toBe(`Testing ${from} to ${to}`);
        });
      }
    }
  });

  describe('Illegal Transitions', () => {
    for (const from of ALL_STATUSES) {
      const allowed = LEGAL_TRANSITIONS[from];
      const disallowed = ALL_STATUSES.filter((s) => !allowed.includes(s));

      for (const to of disallowed) {
        it(`rejects illegal transition: ${from} -> ${to} with IllegalTransitionException`, async () => {
          const orderId = `illegal-${from}-${to}`;
          createTestOrder(orderId, from);

          await expect(service.transition(orderId, to)).rejects.toThrow(
            IllegalTransitionException,
          );
        });
      }
    }
  });

  it('records transaction hash and external id when provided', async () => {
    const orderId = 'order-tx-hash';
    const order = createTestOrder(orderId, 'SUBMITTED');

    await service.transition(orderId, 'PROCESSING', {
      stellarTxHash: 'abc123hash',
      externalId: 'ext-456',
    });

    expect(order.stellarTxHash).toBe('abc123hash');
    expect(order.externalId).toBe('ext-456');
  });
});
