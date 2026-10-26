import { z } from 'zod';
import { AssetSchema } from '@lumenflow/shared-types';

export const CreateSwapQuoteRequestSchema = z
  .object({
    sourceAsset: AssetSchema,
    destinationAsset: AssetSchema,
    sourceAmount: z.string().optional(),
    destinationAmount: z.string().optional(),
    slippageTolerance: z.number().min(0).max(0.5).optional(),
  })
  .refine(
    (data) => data.sourceAmount !== undefined || data.destinationAmount !== undefined,
    {
      message: 'Either sourceAmount or destinationAmount must be provided.',
    },
  );

export type CreateSwapQuoteRequestDto = z.infer<typeof CreateSwapQuoteRequestSchema>;

export const BuildSwapRequestSchema = z.object({
  quoteId: z.string(),
  senderPublicKey: z.string().length(56),
  orderId: z.string().optional(),
});

export type BuildSwapRequestDto = z.infer<typeof BuildSwapRequestSchema>;

export const BuildSwapResponseSchema = z.object({
  unsignedXdr: z.string(),
  quoteId: z.string(),
  orderId: z.string(),
  addedTrustline: z.boolean(),
  networkPassphrase: z.string(),
});

export type BuildSwapResponseDto = z.infer<typeof BuildSwapResponseSchema>;

export const SubmitSwapRequestSchema = z.object({
  signedXdr: z.string().min(1),
  orderId: z.string().optional(),
});

export type SubmitSwapRequestDto = z.infer<typeof SubmitSwapRequestSchema>;

export const SubmitSwapResponseSchema = z.object({
  orderId: z.string(),
  status: z.string(),
  stellarTxHash: z.string(),
  ledger: z.number().optional(),
});

export type SubmitSwapResponseDto = z.infer<typeof SubmitSwapResponseSchema>;
