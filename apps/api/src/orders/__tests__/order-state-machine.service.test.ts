import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
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

  describe('Legal Transitions (In-Memory)', () => {
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

  describe('Illegal Transitions (In-Memory)', () => {
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

  it('retrieves in-memory order correctly', () => {
    const order = createTestOrder('mem-check-1', 'CREATED');
    expect(service.getInMemoryOrder('mem-check-1')).toBe(order);
    expect(service.getInMemoryOrder('non-existent')).toBeUndefined();
  });

  describe('Database Persistence Path ($transaction)', () => {
    it('executes atomic update and order_event creation in database transaction', async () => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'db-order-1',
            status: 'SUBMITTED',
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        orderEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
      } as unknown as PrismaService;

      const dbService = new OrderStateMachineService(mockPrisma);

      const result = await dbService.transition('db-order-1', 'PROCESSING', {
        reason: 'Payment confirmed on ledger',
        stellarTxHash: 'tx_hash_stellar_123',
        externalId: 'ext_anchor_999',
      });

      expect(result).toEqual({
        id: 'db-order-1',
        status: 'PROCESSING',
        previousStatus: 'SUBMITTED',
      });

      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'db-order-1' },
        data: {
          status: 'PROCESSING',
          stellarTxHash: 'tx_hash_stellar_123',
          externalId: 'ext_anchor_999',
        },
      });

      expect(mockTx.orderEvent.create).toHaveBeenCalledWith({
        data: {
          orderId: 'db-order-1',
          fromStatus: 'SUBMITTED',
          toStatus: 'PROCESSING',
          reason: 'Payment confirmed on ledger',
          metadata: undefined,
        },
      });
    });

    it('throws NotFoundException when order is missing in database', async () => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
      } as unknown as PrismaService;

      const dbService = new OrderStateMachineService(mockPrisma);

      await expect(
        dbService.transition('db-missing-id', 'PROCESSING'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws IllegalTransitionException when database order status transition is invalid', async () => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'db-order-completed',
            status: 'COMPLETED',
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
      } as unknown as PrismaService;

      const dbService = new OrderStateMachineService(mockPrisma);

      await expect(
        dbService.transition('db-order-completed', 'PROCESSING'),
      ).rejects.toThrow(IllegalTransitionException);
    });

    it('propagates and logs unexpected database connection errors', async () => {
      const mockPrisma = {
        $transaction: vi.fn().mockRejectedValue(new Error('PostgreSQL connection timeout')),
      } as unknown as PrismaService;

      const dbService = new OrderStateMachineService(mockPrisma);

      await expect(
        dbService.transition('db-order-error', 'PROCESSING'),
      ).rejects.toThrow('PostgreSQL connection timeout');
    });
  });
});
