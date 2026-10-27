import {
  Sep24WithdrawResponseSchema,
  Sep24TransactionResponseSchema,
  type Sep24WithdrawRequest,
  type Sep24WithdrawResponse,
  type Sep24Transaction,
  type AnchorClientOptions,
} from './types';
import { Sep24Error } from './errors';
import { requestWithRetry } from './http';

export class Sep24Client {
  constructor(private readonly defaultOptions?: AnchorClientOptions) {}

  /**
   * Initiates an interactive withdrawal session under SEP-24.
   * Returns interactive URL and anchor transaction ID.
   */
  async initiateWithdraw(
    transferServer: string,
    token: string,
    params: Sep24WithdrawRequest,
  ): Promise<Sep24WithdrawResponse> {
    const url = `${transferServer.replace(/\/$/, '')}/transactions/withdraw/interactive`;

    const formData = new URLSearchParams();
    formData.set('asset_code', params.asset_code);
    formData.set('account', params.account);
    if (params.amount) formData.set('amount', params.amount);
    if (params.memo) formData.set('memo', params.memo);
    if (params.memo_type) formData.set('memo_type', params.memo_type);
    if (params.wallet_name) formData.set('wallet_name', params.wallet_name);
    if (params.wallet_url) formData.set('wallet_url', params.wallet_url);
    if (params.lang) formData.set('lang', params.lang);

    try {
      return await requestWithRetry(url, Sep24WithdrawResponseSchema, {
        method: 'POST',
        token,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        timeoutMs: this.defaultOptions?.timeoutMs,
      });
    } catch (err: unknown) {
      throw new Sep24Error(
        `SEP-24 withdraw initiation failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Fetches status of an active SEP-24 transaction by anchor transaction ID.
   */
  async getTransaction(
    transferServer: string,
    token: string,
    transactionId: string,
  ): Promise<Sep24Transaction> {
    const url = new URL(`${transferServer.replace(/\/$/, '')}/transaction`);
    url.searchParams.set('id', transactionId);

    try {
      const response = await requestWithRetry(
        url.toString(),
        Sep24TransactionResponseSchema,
        {
          method: 'GET',
          token,
          timeoutMs: this.defaultOptions?.timeoutMs,
        },
      );
      return response.transaction;
    } catch (err: unknown) {
      throw new Sep24Error(
        `SEP-24 getTransaction failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
  }
}
