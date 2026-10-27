import { z } from 'zod';

// ==========================================
// SEP-1: stellar.toml Discovery
// ==========================================
export const Sep1CurrencySchema = z.object({
  code: z.string(),
  issuer: z.string().optional(),
  status: z.string().optional(),
  is_asset_anchored: z.boolean().optional(),
  anchor_asset_type: z.string().optional(),
  desc: z.string().optional(),
});
export type Sep1Currency = z.infer<typeof Sep1CurrencySchema>;

export const Sep1StellarTomlSchema = z.object({
  VERSION: z.string().optional(),
  NETWORK_PASSPHRASE: z.string().optional(),
  SIGNING_KEY: z.string().optional(),
  WEB_AUTH_ENDPOINT: z.string().optional(),
  TRANSFER_SERVER_SEP0024: z.string().optional(),
  KYC_SERVER: z.string().optional(),
  DIRECT_PAYMENT_SERVER: z.string().optional(),
  ACCOUNTS: z.array(z.string()).optional(),
  CURRENCIES: z.array(Sep1CurrencySchema).optional(),
});
export type Sep1StellarToml = z.infer<typeof Sep1StellarTomlSchema>;

// ==========================================
// SEP-10: Web Authentication
// ==========================================
export const Sep10ChallengeResponseSchema = z.object({
  transaction: z.string(),
  network_passphrase: z.string().optional(),
});
export type Sep10ChallengeResponse = z.infer<typeof Sep10ChallengeResponseSchema>;

export const Sep10TokenResponseSchema = z.object({
  token: z.string(),
});
export type Sep10TokenResponse = z.infer<typeof Sep10TokenResponseSchema>;

// ==========================================
// SEP-12: KYC API
// ==========================================
export const Sep12CustomerStatusSchema = z.enum([
  'NEEDS_INFO',
  'ACCEPTED',
  'PROCESSING',
  'REJECTED',
]);
export type Sep12CustomerStatus = z.infer<typeof Sep12CustomerStatusSchema>;

export const Sep12CustomerFieldSchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  choices: z.array(z.string()).optional(),
  optional: z.boolean().optional(),
});

export const Sep12CustomerResponseSchema = z.object({
  id: z.string(),
  status: Sep12CustomerStatusSchema,
  fields: z.record(z.string(), Sep12CustomerFieldSchema).optional(),
  message: z.string().optional(),
  provided_fields: z.record(z.string(), z.unknown()).optional(),
});
export type Sep12CustomerResponse = z.infer<typeof Sep12CustomerResponseSchema>;

export const Sep12PutCustomerRequestSchema = z.object({
  id: z.string().optional(),
  account: z.string().optional(),
  memo: z.string().optional(),
  type: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email_address: z.string().optional(),
  id_type: z.string().optional(),
  id_number: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
});
export type Sep12PutCustomerRequest = z.infer<typeof Sep12PutCustomerRequestSchema>;

// ==========================================
// SEP-24: Interactive Deposit / Withdraw
// ==========================================
export const Sep24WithdrawRequestSchema = z.object({
  asset_code: z.string(),
  account: z.string(),
  amount: z.string().optional(),
  memo: z.string().optional(),
  memo_type: z.string().optional(),
  wallet_name: z.string().optional(),
  wallet_url: z.string().optional(),
  lang: z.string().optional(),
});
export type Sep24WithdrawRequest = z.infer<typeof Sep24WithdrawRequestSchema>;

export const Sep24WithdrawResponseSchema = z.object({
  type: z.literal('interactive_customer_info_needed'),
  url: z.string(),
  id: z.string(),
});
export type Sep24WithdrawResponse = z.infer<typeof Sep24WithdrawResponseSchema>;

export const Sep24TransactionStatusSchema = z.enum([
  'incomplete',
  'pending_user_transfer_start',
  'pending_user_transfer_complete',
  'pending_external',
  'pending_anchor',
  'pending_stellar',
  'pending_trust',
  'pending_user',
  'completed',
  'refunded',
  'expired',
  'no_market',
  'too_small',
  'too_large',
  'error',
]);
export type Sep24TransactionStatus = z.infer<typeof Sep24TransactionStatusSchema>;

export const Sep24TransactionSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: Sep24TransactionStatusSchema,
  status_eta: z.number().optional(),
  amount_in: z.string().optional(),
  amount_out: z.string().optional(),
  amount_fee: z.string().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  stellar_transaction_id: z.string().optional(),
  external_transaction_id: z.string().optional(),
  withdraw_anchor_account: z.string().optional(),
  withdraw_memo: z.string().optional(),
  withdraw_memo_type: z.string().optional(),
  message: z.string().optional(),
});
export type Sep24Transaction = z.infer<typeof Sep24TransactionSchema>;

export const Sep24TransactionResponseSchema = z.object({
  transaction: Sep24TransactionSchema,
});
export type Sep24TransactionResponse = z.infer<typeof Sep24TransactionResponseSchema>;

// ==========================================
// Anchor Client Options
// ==========================================
export interface AnchorClientOptions {
  timeoutMs?: number | undefined;
  maxRetries?: number | undefined;
  retryDelayMs?: number | undefined;
}
