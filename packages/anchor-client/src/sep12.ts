import {
  Sep12CustomerResponseSchema,
  type Sep12CustomerResponse,
  type Sep12PutCustomerRequest,
  type AnchorClientOptions,
} from './types';
import { Sep12Error } from './errors';
import { requestWithRetry } from './http';

export class Sep12Client {
  constructor(private readonly defaultOptions?: AnchorClientOptions) {}

  /**
   * Fetches KYC customer status and needed fields.
   */
  async getCustomer(
    kycServer: string,
    token: string,
    query?: {
      id?: string | undefined;
      account?: string | undefined;
      memo?: string | undefined;
      type?: string | undefined;
    },
  ): Promise<Sep12CustomerResponse> {
    const url = new URL(`${kycServer.replace(/\/$/, '')}/customer`);
    if (query?.id) url.searchParams.set('id', query.id);
    if (query?.account) url.searchParams.set('account', query.account);
    if (query?.memo) url.searchParams.set('memo', query.memo);
    if (query?.type) url.searchParams.set('type', query.type);

    try {
      return await requestWithRetry(url.toString(), Sep12CustomerResponseSchema, {
        method: 'GET',
        token,
        timeoutMs: this.defaultOptions?.timeoutMs,
      });
    } catch (err: unknown) {
      throw new Sep12Error(
        `SEP-12 getCustomer failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Submits or updates KYC customer information.
   */
  async putCustomer(
    kycServer: string,
    token: string,
    data: Sep12PutCustomerRequest,
  ): Promise<Sep12CustomerResponse> {
    const url = `${kycServer.replace(/\/$/, '')}/customer`;
    try {
      return await requestWithRetry(url, Sep12CustomerResponseSchema, {
        method: 'PUT',
        token,
        body: JSON.stringify(data),
        timeoutMs: this.defaultOptions?.timeoutMs,
      });
    } catch (err: unknown) {
      throw new Sep12Error(
        `SEP-12 putCustomer failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Deletes customer records (for testing or right-to-be-forgotten compliance).
   */
  async deleteCustomer(
    kycServer: string,
    token: string,
    account: string,
  ): Promise<void> {
    const url = `${kycServer.replace(/\/$/, '')}/customer/${encodeURIComponent(account)}`;
    const controller = new AbortController();
    const timeoutMs = this.defaultOptions?.timeoutMs ?? 5000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok && res.status !== 404) {
        throw new Sep12Error(`DELETE customer failed with status ${res.status}`);
      }
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Sep12Error) throw err;
      throw new Sep12Error(
        `SEP-12 deleteCustomer failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
  }
}
