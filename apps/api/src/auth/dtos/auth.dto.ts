import { z } from 'zod';

export const ChallengeRequestSchema = z.object({
  publicKey: z.string().length(56),
});

export type ChallengeRequestDto = z.infer<typeof ChallengeRequestSchema>;

export const ChallengeResponseSchema = z.object({
  transaction: z.string(),
  networkPassphrase: z.string(),
});

export type ChallengeResponseDto = z.infer<typeof ChallengeResponseSchema>;

export const VerifyRequestSchema = z.object({
  transaction: z.string().min(1),
});

export type VerifyRequestDto = z.infer<typeof VerifyRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  publicKey: z.string(),
});

export type AuthUserDto = z.infer<typeof AuthUserSchema>;

export const VerifyResponseSchema = z.object({
  token: z.string(),
  user: AuthUserSchema,
});

export type VerifyResponseDto = z.infer<typeof VerifyResponseSchema>;
