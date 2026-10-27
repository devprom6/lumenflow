import { Keypair, Transaction, Networks } from '@stellar/stellar-sdk';
import {
  Sep10ChallengeResponseSchema,
  Sep10TokenResponseSchema,
  type AnchorClientOptions,
} from './types';
import { Sep10Error } from './errors';
import { requestWithRetry } from './http';

export class Sep10Client {
  constructor(private readonly defaultOptions?: AnchorClientOptions) {}

  /**
   * Requests a SEP-10 challenge transaction from the anchor's web auth endpoint.
   */
  async getChallenge(
    authEndpoint: string,
    account: string,
    options?: {
      homeDomain?: string | undefined;
      clientDomain?: string | undefined;
      timeoutMs?: number | undefined;
    },
  ): Promise<{ transaction: string; networkPassphrase?: string }> {
    const url = new URL(authEndpoint);
    url.searchParams.set('account', account);
    if (options?.homeDomain) {
      url.searchParams.set('home_domain', options.homeDomain);
    }
    if (options?.clientDomain) {
      url.searchParams.set('client_domain', options.clientDomain);
    }

    try {
      const data = await requestWithRetry(
        url.toString(),
        Sep10ChallengeResponseSchema,
        {
          method: 'GET',
          timeoutMs: options?.timeoutMs ?? this.defaultOptions?.timeoutMs,
        },
      );

      return {
        transaction: data.transaction,
        ...(data.network_passphrase ? { networkPassphrase: data.network_passphrase } : {}),
      };
    } catch (err: unknown) {
      throw new Sep10Error(
        `SEP-10 challenge request failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Submits a signed SEP-10 challenge transaction to obtain a JWT authentication token.
   */
  async submitChallenge(
    authEndpoint: string,
    signedTransactionXdr: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<{ token: string }> {
    try {
      const data = await requestWithRetry(
        authEndpoint,
        Sep10TokenResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify({ transaction: signedTransactionXdr }),
          timeoutMs: options?.timeoutMs ?? this.defaultOptions?.timeoutMs,
        },
      );

      return data;
    } catch (err: unknown) {
      throw new Sep10Error(
        `SEP-10 challenge verification failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Helper utility for local signing in tests and scripts (non-custodial: client-held key).
   */
  static signChallengeLocally(
    challengeXdr: string,
    signerKeypair: Keypair,
    networkPassphrase = Networks.TESTNET,
  ): string {
    const tx = new Transaction(challengeXdr, networkPassphrase);
    tx.sign(signerKeypair);
    return tx.toXDR();
  }
}
