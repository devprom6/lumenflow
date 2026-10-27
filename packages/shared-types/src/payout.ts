import { z } from 'zod';

export const PayoutStatusSchema = z.enum([
  'INITIATED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

export const PayoutRecipientSchema = z.object({
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  phone: z.string().optional(),
  currency: z.string().optional(),
});
export type PayoutRecipient = z.infer<typeof PayoutRecipientSchema>;

export const PayoutParamsSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.string(),
  currency: z.string(),
  recipient: PayoutRecipientSchema,
  memo: z.string().optional(),
});
export type PayoutParams = z.infer<typeof PayoutParamsSchema>;

export const PayoutResultSchema = z.object({
  payoutId: z.string(),
  status: PayoutStatusSchema,
  externalReference: z.string().optional(),
  fee: z.string(),
});
export type PayoutResult = z.infer<typeof PayoutResultSchema>;

export interface PayoutAdapter {
  readonly name: string;
  initiatePayout(params: PayoutParams): Promise<PayoutResult>;
  getPayoutStatus(payoutId: string): Promise<PayoutResult>;
}
