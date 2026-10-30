import { z } from 'zod';

export const AnchorWebhookPayloadSchema = z.object({
  eventId: z.string(),
  orderId: z.string().uuid(),
  status: z.string(),
  externalId: z.string().optional(),
  stellarTxHash: z.string().optional(),
  amount: z.string().optional(),
  timestamp: z.string().optional(),
});
export type AnchorWebhookPayload = z.infer<typeof AnchorWebhookPayloadSchema>;

export const PayoutWebhookPayloadSchema = z.object({
  eventId: z.string(),
  orderId: z.string().uuid(),
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING', 'REFUNDED']),
  externalReference: z.string().optional(),
  fee: z.string().optional(),
  timestamp: z.string().optional(),
});
export type PayoutWebhookPayload = z.infer<typeof PayoutWebhookPayloadSchema>;

export const BridgeWebhookPayloadSchema = z.object({
  eventId: z.string().optional(),
  transferId: z.string(),
  orderId: z.string().uuid().optional(),
  provider: z.string().optional(),
  status: z.enum(['PENDING', 'IN_FLIGHT', 'COMPLETED', 'FAILED', 'STUCK', 'REFUNDED']),
  txHash: z.string().optional(),
  message: z.string().optional(),
  timestamp: z.string().optional(),
});
export type BridgeWebhookPayload = z.infer<typeof BridgeWebhookPayloadSchema>;
