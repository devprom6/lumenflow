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
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING']),
  externalReference: z.string().optional(),
  fee: z.string().optional(),
  timestamp: z.string().optional(),
});
export type PayoutWebhookPayload = z.infer<typeof PayoutWebhookPayloadSchema>;
