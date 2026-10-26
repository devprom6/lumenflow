import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString =
  process.env['DATABASE_URL'] ??
  'postgresql://lumenflow:lumenflow_dev_password@localhost:5432/lumenflow_dev';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding LumenFlow database...');

  // 1. Seed Users (Stellar wallet public keys as identity)
  const testUser1 = await prisma.user.upsert({
    where: { publicKey: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI' },
    update: {},
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      publicKey: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
    },
  });

  const testUser2 = await prisma.user.upsert({
    where: { publicKey: 'GABOI7H72XG4XGCR25LVR7H2G2L4K2L7P6RHYL6VTY5YI34K2LQWESEE' },
    update: {},
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      publicKey: 'GABOI7H72XG4XGCR25LVR7H2G2L4K2L7P6RHYL6VTY5YI34K2LQWESEE',
    },
  });

  console.log(`Seeded users: ${testUser1.publicKey}, ${testUser2.publicKey}`);

  // 2. Seed Quotes
  const sampleQuote = await prisma.quote.upsert({
    where: { id: '33333333-3333-3333-3333-333333333333' },
    update: {},
    create: {
      id: '33333333-3333-3333-3333-333333333333',
      userId: testUser1.id,
      sourceAsset: { type: 'native', code: 'XLM' },
      destinationAsset: {
        type: 'credit_alphanum4',
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      },
      sourceAmount: '10.0000000',
      destinationAmount: '1.2500000',
      minimumReceived: '1.2437500',
      slippageTolerance: 0.005,
      priceImpact: 0.001,
      networkFee: '100',
      platformFee: '0.0000000',
      path: [],
      expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour in future
    },
  });

  console.log(`Seeded quote: ${sampleQuote.id}`);

  // 3. Seed Orders and Append-Only OrderEvents
  const completedOrder = await prisma.order.upsert({
    where: { id: '44444444-4444-4444-4444-444444444444' },
    update: {},
    create: {
      id: '44444444-4444-4444-4444-444444444444',
      userId: testUser1.id,
      type: 'SWAP',
      status: 'COMPLETED',
      sourceAsset: { type: 'native', code: 'XLM' },
      destinationAsset: {
        type: 'credit_alphanum4',
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      },
      sourceAmount: '50.0000000',
      destinationAmount: '6.2000000',
      quoteId: sampleQuote.id,
      stellarTxHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    },
  });

  // Append-only audit events for completedOrder
  const existingEvents = await prisma.orderEvent.findMany({
    where: { orderId: completedOrder.id },
  });

  if (existingEvents.length === 0) {
    await prisma.orderEvent.createMany({
      data: [
        {
          orderId: completedOrder.id,
          fromStatus: null,
          toStatus: 'CREATED',
          reason: 'Order initiated by user',
        },
        {
          orderId: completedOrder.id,
          fromStatus: 'CREATED',
          toStatus: 'QUOTED',
          reason: 'Quote locked and assigned',
        },
        {
          orderId: completedOrder.id,
          fromStatus: 'QUOTED',
          toStatus: 'AWAITING_SIGNATURE',
          reason: 'Unsigned transaction built',
        },
        {
          orderId: completedOrder.id,
          fromStatus: 'AWAITING_SIGNATURE',
          toStatus: 'SUBMITTED',
          reason: 'Signed transaction submitted to Stellar Testnet',
        },
        {
          orderId: completedOrder.id,
          fromStatus: 'SUBMITTED',
          toStatus: 'PROCESSING',
          reason: 'Stellar ledger ingestion in progress',
        },
        {
          orderId: completedOrder.id,
          fromStatus: 'PROCESSING',
          toStatus: 'COMPLETED',
          reason: 'Transaction confirmed on ledger',
        },
      ],
    });
  }

  // 4. Seed Webhook Event for idempotent processing check
  await prisma.webhookEvent.upsert({
    where: {
      provider_eventId: {
        provider: 'anchor',
        eventId: 'evt_sample_anchor_deposit_001',
      },
    },
    update: {},
    create: {
      provider: 'anchor',
      eventId: 'evt_sample_anchor_deposit_001',
      eventType: 'transaction.completed',
      payload: { amount: '100.00', currency: 'NGN' },
      processed: true,
      processedAt: new Date(),
    },
  });

  console.log('Seeding completed successfully.');
}

main()
  .catch((e: unknown) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
