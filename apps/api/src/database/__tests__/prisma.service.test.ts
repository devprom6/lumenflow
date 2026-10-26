import { describe, it, expect } from 'vitest';
import { PrismaService } from '../prisma.service';

describe('PrismaService', () => {
  it('instantiates successfully with PrismaPg adapter', () => {
    const service = new PrismaService();
    expect(service).toBeDefined();
  });

  it('enforces append-only order_events by rejecting forbidden operations', () => {
    const service = new PrismaService();

    expect(() =>
      service.assertAppendOnlyOrderEventOperation('update'),
    ).toThrow('Forbidden operation \'update\' on order_events: the table is append-only.');

    expect(() =>
      service.assertAppendOnlyOrderEventOperation('updateMany'),
    ).toThrow('Forbidden operation \'updateMany\' on order_events: the table is append-only.');

    expect(() =>
      service.assertAppendOnlyOrderEventOperation('delete'),
    ).toThrow('Forbidden operation \'delete\' on order_events: the table is append-only.');

    expect(() =>
      service.assertAppendOnlyOrderEventOperation('deleteMany'),
    ).toThrow('Forbidden operation \'deleteMany\' on order_events: the table is append-only.');

    expect(() =>
      service.assertAppendOnlyOrderEventOperation('upsert'),
    ).toThrow('Forbidden operation \'upsert\' on order_events: the table is append-only.');

    // Valid append operations (create, createMany) should not throw
    expect(() => service.assertAppendOnlyOrderEventOperation('create')).not.toThrow();
    expect(() => service.assertAppendOnlyOrderEventOperation('createMany')).not.toThrow();
  });
});
