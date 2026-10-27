import { z } from 'zod';
import {
  BridgeQuoteParamsSchema,
  BridgeQuoteSchema,
  BridgeRouteSchema,
  UnsignedTransferSchema,
  TransferStatusSchema,
} from '@lumenflow/shared-types';

export const BridgeQuoteRequestDto = BridgeQuoteParamsSchema;
export type BridgeQuoteRequest = z.infer<typeof BridgeQuoteRequestDto>;

export const BridgeTransferRequestDto = z.object({
  quoteId: z.string().uuid(),
  sender: z.string().min(1, 'Sender wallet address is required'),
  destinationRecipient: z.string().optional(),
});
export type BridgeTransferRequest = z.infer<typeof BridgeTransferRequestDto>;

export const KillSwitchToggleDto = z.object({
  target: z.string().min(1),
  type: z.enum(['route', 'provider']),
  killed: z.boolean(),
});
export type KillSwitchToggle = z.infer<typeof KillSwitchToggleDto>;

export const RouteLimitConfigDto = z.object({
  routeId: z.string().min(1),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
});
export type RouteLimitConfig = z.infer<typeof RouteLimitConfigDto>;

export {
  BridgeRouteSchema,
  BridgeQuoteSchema,
  UnsignedTransferSchema,
  TransferStatusSchema,
};
