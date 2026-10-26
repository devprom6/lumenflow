import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  Keypair,
  Transaction,
  Networks,
  Account,
  TransactionBuilder,
  Operation,
} from '@stellar/stellar-sdk';
import { SwapService } from '../swap.service';
import { OrderStateMachineService } from '../../orders/order-state-machine.service';
import { PrismaService } from '../../database/prisma.service';
import type { Asset } from '@lumenflow/shared-types';

vi.mock('@lumenflow/stellar', async () => {
  const actual = await vi.importActual<typeof import('@lumenflow/stellar')>('@lumenflow/stellar');
  return {
    ...actual,
    buildSwapTransaction: vi.fn().mockImplementation(async () => {
      const dummyAccount = new Account('GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI', '1');
      const tx = new TransactionBuilder(dummyAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.manageData({
            name: 'mock_swap',
            value: '10',
          }),
        )
        .setTimeout(300)
        .build();

      return {
        unsignedXdr: tx.toXDR(),
        addedTrustline: false,
      };
    }),
    submitTransaction: vi.fn().mockResolvedValue({
      hash: 'mock-tx-hash-1234567890abcdef',
      ledger: 12345,
    }),
  };
});

describe('SwapService', () => {
  let swapService: SwapService;
  let stateMachine: OrderStateMachineService;
  let prisma: PrismaService;

  const XLM: Asset = { type: 'native', code: 'XLM' };
  const USDC: Asset = {
    type: 'credit_alphanum4',
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  };

  beforeEach(() => {
    prisma = new PrismaService();
    stateMachine = new OrderStateMachineService(prisma);
    swapService = new SwapService(prisma, stateMachine);
  });

  it('generates a valid swap quote with fees and price impact', async () => {
    const quote = await swapService.createQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '10.0000000',
    });

    expect(quote.id).toBeDefined();
    expect(quote.sourceAmount).toBe('10.0000000');
    expect(parseFloat(quote.destinationAmount)).toBeGreaterThan(0);
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('builds an unsigned swap transaction for a fresh quote', async () => {
    const user = Keypair.random();
    const quote = await swapService.createQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '20.0000000',
    });

    const buildResult = await swapService.buildSwap({
      quoteId: quote.id,
      senderPublicKey: user.publicKey(),
    });

    expect(buildResult.unsignedXdr).toBeDefined();
    expect(buildResult.quoteId).toBe(quote.id);
    expect(buildResult.orderId).toBeDefined();

    // Verify order is transitioned to AWAITING_SIGNATURE
    const order = stateMachine.getInMemoryOrder(buildResult.orderId);
    expect(order?.status).toBe('AWAITING_SIGNATURE');
  });

  it('rejects building an unsigned swap transaction when quote is expired', async () => {
    const user = Keypair.random();
    const quote = await swapService.createQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '10.0000000',
    });

    // Artificially expire the quote
    quote.expiresAt = new Date(Date.now() - 1000).toISOString();

    await expect(
      swapService.buildSwap({
        quoteId: quote.id,
        senderPublicKey: user.publicKey(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('submits a user-signed transaction, transitioning states to COMPLETED with events history', async () => {
    const user = Keypair.random();
    const quote = await swapService.createQuote({
      sourceAsset: XLM,
      destinationAsset: USDC,
      sourceAmount: '15.0000000',
    });

    const buildResult = await swapService.buildSwap({
      quoteId: quote.id,
      senderPublicKey: user.publicKey(),
    });

    // Client signs locally
    const tx = new Transaction(buildResult.unsignedXdr, Networks.TESTNET);
    tx.sign(user);
    const signedXdr = tx.toXDR();

    const submitResult = await swapService.submitSwap({
      signedXdr,
      orderId: buildResult.orderId,
    });

    expect(submitResult.status).toBe('COMPLETED');
    expect(submitResult.stellarTxHash).toBeDefined();

    // Check order events history
    const order = stateMachine.getInMemoryOrder(buildResult.orderId);
    expect(order?.status).toBe('COMPLETED');
    const statuses = order?.events.map((e) => e.toStatus);
    expect(statuses).toContain('AWAITING_SIGNATURE');
    expect(statuses).toContain('SUBMITTED');
    expect(statuses).toContain('PROCESSING');
    expect(statuses).toContain('COMPLETED');
  });
});
