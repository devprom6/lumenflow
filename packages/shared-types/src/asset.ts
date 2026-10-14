import { z } from 'zod';

/**
 * Represents a Stellar asset (native XLM or issued token).
 *
 * - `native` assets have no `issuer`.
 * - Non-native assets must include both `code` and `issuer`.
 */
export const AssetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('native'),
    code: z.literal('XLM'),
  }),
  z.object({
    type: z.literal('credit_alphanum4'),
    code: z.string().min(1).max(4),
    issuer: z.string().length(56),
  }),
  z.object({
    type: z.literal('credit_alphanum12'),
    code: z.string().min(5).max(12),
    issuer: z.string().length(56),
  }),
]);

export type Asset = z.infer<typeof AssetSchema>;
