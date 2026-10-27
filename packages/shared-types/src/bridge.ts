import { z } from 'zod';

export const BridgeRouteSchema = z.object({
  id: z.string(),
  fromChain: z.string(),
  toChain: z.string(),
  fromAsset: z.string(),
  toAsset: z.string(),
  minAmount: z.string(),
  maxAmount: z.string(),
  estimatedDurationSeconds: z.number().int().positive(),
  enabled: z.boolean().default(true),
});
export type BridgeRoute = z.infer<typeof BridgeRouteSchema>;

export const BridgeQuoteParamsSchema = z.object({
  fromChain: z.string(),
  toChain: z.string(),
  fromAsset: z.string(),
  toAsset: z.string(),
  amount: z.string(),
  slippageTolerance: z.number().optional(),
});
export type QuoteParams = z.infer<typeof BridgeQuoteParamsSchema>;

export const BridgeFeeSchema = z.object({
  amount: z.string(),
  asset: z.string(),
});
export type BridgeFee = z.infer<typeof BridgeFeeSchema>;

export const BridgeQuoteSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  fromChain: z.string(),
  toChain: z.string(),
  fromAsset: z.string(),
  toAsset: z.string(),
  fromAmount: z.string(),
  toAmount: z.string(),
  estimatedDurationSeconds: z.number().int().positive(),
  fee: BridgeFeeSchema,
  rate: z.string(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type BridgeQuote = z.infer<typeof BridgeQuoteSchema>;

export const UnsignedTransferSchema = z.object({
  transferId: z.string(),
  provider: z.string(),
  fromChain: z.string(),
  toChain: z.string(),
  unsignedTransaction: z.string(),
  sender: z.string(),
  depositAddress: z.string().optional(),
  memo: z.string().optional(),
  networkPassphrase: z.string().optional(),
});
export type UnsignedTransfer = z.infer<typeof UnsignedTransferSchema>;

export const TransferStatusEnum = z.enum([
  'PENDING',
  'IN_FLIGHT',
  'COMPLETED',
  'FAILED',
  'STUCK',
]);
export type TransferStatusState = z.infer<typeof TransferStatusEnum>;

export const TransferStatusSchema = z.object({
  transferId: z.string(),
  provider: z.string(),
  status: TransferStatusEnum,
  fromTxHash: z.string().optional(),
  toTxHash: z.string().optional(),
  confirmations: z.number().optional(),
  requiredConfirmations: z.number().optional(),
  message: z.string().optional(),
  isStuck: z.boolean().optional(),
  updatedAt: z.string().datetime(),
});
export type TransferStatus = z.infer<typeof TransferStatusSchema>;

/**
 * Common BridgeAdapter interface exactly as specified in README.md:
 *
 * export interface BridgeAdapter {
 *   name: string;
 *   getSupportedRoutes(): Promise<BridgeRoute[]>;
 *   getQuote(params: QuoteParams): Promise<BridgeQuote>;
 *   buildTransfer(quote: BridgeQuote, sender: string): Promise<UnsignedTransfer>;
 *   getStatus(transferId: string): Promise<TransferStatus>;
 * }
 */
export interface BridgeAdapter {
  name: string;
  getSupportedRoutes(): Promise<BridgeRoute[]>;
  getQuote(params: QuoteParams): Promise<BridgeQuote>;
  buildTransfer(quote: BridgeQuote, sender: string): Promise<UnsignedTransfer>;
  getStatus(transferId: string): Promise<TransferStatus>;
  isHealthy?(): Promise<boolean>;
}
