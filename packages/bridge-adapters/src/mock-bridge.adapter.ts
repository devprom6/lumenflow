import { randomUUID } from 'node:crypto';
import type {
  BridgeAdapter,
  BridgeQuote,
  BridgeRoute,
  QuoteParams,
  TransferStatus,
  TransferStatusState,
  UnsignedTransfer,
} from '@lumenflow/shared-types';
import {
  BridgeQuoteSchema,
  TransferStatusSchema,
  UnsignedTransferSchema,
} from '@lumenflow/shared-types';

export type SimulationMode = 'SUCCESS' | 'SLOW' | 'FAILURE' | 'STUCK';

export interface MockBridgeAdapterOptions {
  name?: string | undefined;
  mode?: SimulationMode | undefined;
  healthy?: boolean | undefined;
  feePercent?: number | undefined;
  routes?: BridgeRoute[] | undefined;
}

interface StoredTransfer {
  quote: BridgeQuote;
  sender: string;
  transferId: string;
  createdAt: number;
  status: TransferStatusState;
  isStuck?: boolean | undefined;
  errorMessage?: string | undefined;
  txHash?: string | undefined;
}

export const DEFAULT_MOCK_ROUTES: BridgeRoute[] = [
  {
    id: 'stellar-eth-usdc',
    fromChain: 'stellar',
    toChain: 'ethereum',
    fromAsset: 'USDC',
    toAsset: 'USDC',
    minAmount: '10',
    maxAmount: '50000',
    estimatedDurationSeconds: 120,
    enabled: true,
  },
  {
    id: 'eth-stellar-usdc',
    fromChain: 'ethereum',
    toChain: 'stellar',
    fromAsset: 'USDC',
    toAsset: 'USDC',
    minAmount: '10',
    maxAmount: '50000',
    estimatedDurationSeconds: 180,
    enabled: true,
  },
  {
    id: 'stellar-polygon-usdc',
    fromChain: 'stellar',
    toChain: 'polygon',
    fromAsset: 'USDC',
    toAsset: 'USDC',
    minAmount: '5',
    maxAmount: '25000',
    estimatedDurationSeconds: 60,
    enabled: true,
  },
  {
    id: 'polygon-stellar-usdc',
    fromChain: 'polygon',
    toChain: 'stellar',
    fromAsset: 'USDC',
    toAsset: 'USDC',
    minAmount: '5',
    maxAmount: '25000',
    estimatedDurationSeconds: 90,
    enabled: true,
  },
  {
    id: 'stellar-solana-usdc',
    fromChain: 'stellar',
    toChain: 'solana',
    fromAsset: 'USDC',
    toAsset: 'USDC',
    minAmount: '10',
    maxAmount: '20000',
    estimatedDurationSeconds: 45,
    enabled: true,
  },
];

export class MockBridgeAdapter implements BridgeAdapter {
  public readonly name: string;
  private mode: SimulationMode;
  private healthy: boolean;
  private readonly feePercent: number;
  private readonly routes: BridgeRoute[];
  private readonly transfers: Map<string, StoredTransfer> = new Map();

  constructor(options?: MockBridgeAdapterOptions) {
    this.name = options?.name ?? 'MockBridge';
    this.mode = options?.mode ?? 'SUCCESS';
    this.healthy = options?.healthy ?? true;
    this.feePercent = options?.feePercent ?? 0.0025; // 0.25%
    this.routes = options?.routes ? [...options.routes] : [...DEFAULT_MOCK_ROUTES];
  }

  public setSimulationMode(mode: SimulationMode): void {
    this.mode = mode;
  }

  public getSimulationMode(): SimulationMode {
    return this.mode;
  }

  public setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  public async isHealthy(): Promise<boolean> {
    await Promise.resolve();
    return this.healthy;
  }

  public async getSupportedRoutes(): Promise<BridgeRoute[]> {
    await Promise.resolve();
    if (!this.healthy) {
      throw new Error(`Provider ${this.name} is currently unhealthy`);
    }
    return this.routes.filter((route) => route.enabled);
  }

  public async getQuote(params: QuoteParams): Promise<BridgeQuote> {
    await Promise.resolve();
    if (!this.healthy) {
      throw new Error(`Provider ${this.name} is currently unhealthy`);
    }

    const matchingRoute = this.routes.find(
      (r) =>
        r.fromChain.toLowerCase() === params.fromChain.toLowerCase() &&
        r.toChain.toLowerCase() === params.toChain.toLowerCase() &&
        r.fromAsset.toUpperCase() === params.fromAsset.toUpperCase() &&
        r.toAsset.toUpperCase() === params.toAsset.toUpperCase() &&
        r.enabled,
    );

    if (!matchingRoute) {
      throw new Error(
        `Route ${params.fromChain}:${params.fromAsset} -> ${params.toChain}:${params.toAsset} is not supported by ${this.name}`,
      );
    }

    const amountNum = parseFloat(params.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Invalid quote amount');
    }

    const minAmount = parseFloat(matchingRoute.minAmount);
    const maxAmount = parseFloat(matchingRoute.maxAmount);
    if (amountNum < minAmount) {
      throw new Error(`Amount ${amountNum} is below minimum allowed (${minAmount})`);
    }
    if (amountNum > maxAmount) {
      throw new Error(`Amount ${amountNum} exceeds maximum allowed (${maxAmount})`);
    }

    const feeAmount = (amountNum * this.feePercent).toFixed(4);
    const netAmount = (amountNum - parseFloat(feeAmount)).toFixed(4);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes validity

    const quoteData = {
      id: randomUUID(),
      provider: this.name,
      fromChain: matchingRoute.fromChain,
      toChain: matchingRoute.toChain,
      fromAsset: matchingRoute.fromAsset,
      toAsset: matchingRoute.toAsset,
      fromAmount: params.amount,
      toAmount: netAmount,
      estimatedDurationSeconds: matchingRoute.estimatedDurationSeconds,
      fee: {
        amount: feeAmount,
        asset: matchingRoute.fromAsset,
      },
      rate: '1.0000',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    return BridgeQuoteSchema.parse(quoteData);
  }

  public async buildTransfer(quote: BridgeQuote, sender: string): Promise<UnsignedTransfer> {
    await Promise.resolve();
    if (!this.healthy) {
      throw new Error(`Provider ${this.name} is currently unhealthy`);
    }

    const now = new Date();
    if (new Date(quote.expiresAt).getTime() < now.getTime()) {
      throw new Error('Bridge quote has expired');
    }

    const transferId = `br_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const depositAddress =
      quote.fromChain.toLowerCase() === 'stellar'
        ? 'GBRIDGEHOLDINGTESTNETOPERATORADDRESS7X7X7X7X7X7X7X7X7X7X7X7'
        : '0x1111111254fb6c44bac0bed2854e76f90643097d';

    const unsignedTransaction = Buffer.from(
      JSON.stringify({
        source: sender,
        destination: depositAddress,
        asset: quote.fromAsset,
        amount: quote.fromAmount,
        quoteId: quote.id,
        transferId,
        nonce: Date.now(),
      }),
    ).toString('base64');

    const unsignedTransferData = {
      transferId,
      provider: this.name,
      fromChain: quote.fromChain,
      toChain: quote.toChain,
      unsignedTransaction,
      sender,
      depositAddress,
      memo: `LF-BR-${transferId.slice(-6)}`,
      networkPassphrase: 'Test SDF Network ; September 2015',
    };

    const initialStatus: TransferStatusState =
      this.mode === 'FAILURE'
        ? 'FAILED'
        : this.mode === 'STUCK'
          ? 'STUCK'
          : 'PENDING';

    this.transfers.set(transferId, {
      quote,
      sender,
      transferId,
      createdAt: Date.now(),
      status: initialStatus,
      isStuck: this.mode === 'STUCK',
      errorMessage: this.mode === 'FAILURE' ? 'Simulated bridge provider failure' : undefined,
    });

    return UnsignedTransferSchema.parse(unsignedTransferData);
  }

  public async getStatus(transferId: string): Promise<TransferStatus> {
    await Promise.resolve();
    const record = this.transfers.get(transferId);
    const nowIso = new Date().toISOString();

    if (!record) {
      // Transfer not found in mock state
      return TransferStatusSchema.parse({
        transferId,
        provider: this.name,
        status: 'FAILED',
        message: `Transfer ${transferId} not found`,
        updatedAt: nowIso,
      });
    }

    if (this.mode === 'FAILURE' || record.status === 'FAILED') {
      return TransferStatusSchema.parse({
        transferId,
        provider: this.name,
        status: 'FAILED',
        message: record.errorMessage ?? 'Bridge transfer failed on destination chain',
        updatedAt: nowIso,
      });
    }

    if (this.mode === 'STUCK' || record.isStuck) {
      return TransferStatusSchema.parse({
        transferId,
        provider: this.name,
        status: 'STUCK',
        isStuck: true,
        message: 'Transfer stuck: exceeded maximum expected transfer duration',
        updatedAt: nowIso,
      });
    }

    if (record.status === 'COMPLETED') {
      return TransferStatusSchema.parse({
        transferId,
        provider: this.name,
        status: 'COMPLETED',
        fromTxHash: record.txHash ?? '3d5a4bf893e11234567890abcdef1234567890abcdef1234567890abcdef1234',
        toTxHash: '0x88f28c11aa234567890abcdef1234567890abcdef1234567890abcdef1234',
        confirmations: 24,
        requiredConfirmations: 24,
        updatedAt: nowIso,
      });
    }

    const elapsedMs = Date.now() - record.createdAt;

    if (this.mode === 'SLOW') {
      // Slow mode takes 10 seconds to reach in flight and stays in flight
      if (elapsedMs < 2000) {
        return TransferStatusSchema.parse({
          transferId,
          provider: this.name,
          status: 'PENDING',
          updatedAt: nowIso,
        });
      }
      return TransferStatusSchema.parse({
        transferId,
        provider: this.name,
        status: 'IN_FLIGHT',
        confirmations: 2,
        requiredConfirmations: 30,
        message: 'Awaiting high confirmation threshold on destination chain',
        updatedAt: nowIso,
      });
    }

    // Default SUCCESS progression:
    // 0s..500ms -> PENDING
    // 500ms..1500ms -> IN_FLIGHT
    // > 1500ms -> COMPLETED
    if (elapsedMs < 300) {
      return TransferStatusSchema.parse({
        transferId,
        provider: this.name,
        status: 'PENDING',
        updatedAt: nowIso,
      });
    }

    if (elapsedMs < 1200) {
      return TransferStatusSchema.parse({
        transferId,
        provider: this.name,
        status: 'IN_FLIGHT',
        fromTxHash: '3d5a4bf893e11234567890abcdef1234567890abcdef1234567890abcdef1234',
        confirmations: 12,
        requiredConfirmations: 24,
        updatedAt: nowIso,
      });
    }

    return TransferStatusSchema.parse({
      transferId,
      provider: this.name,
      status: 'COMPLETED',
      fromTxHash: '3d5a4bf893e11234567890abcdef1234567890abcdef1234567890abcdef1234',
      toTxHash: '0x88f28c11aa234567890abcdef1234567890abcdef1234567890abcdef1234',
      confirmations: 24,
      requiredConfirmations: 24,
      updatedAt: nowIso,
    });
  }

  public setCustomTransferStatus(
    transferId: string,
    update: {
      status?: TransferStatusState | undefined;
      isStuck?: boolean | undefined;
      errorMessage?: string | undefined;
    },
  ): void {
    const existing = this.transfers.get(transferId);
    if (existing) {
      if (update.status !== undefined) existing.status = update.status;
      if (update.isStuck !== undefined) existing.isStuck = update.isStuck;
      if (update.errorMessage !== undefined) existing.errorMessage = update.errorMessage;
    }
  }
}
