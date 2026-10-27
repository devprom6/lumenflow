import { discoverStellarToml } from './sep1';
import { Sep10Client } from './sep10';
import { Sep12Client } from './sep12';
import { Sep24Client } from './sep24';
import {
  type AnchorClientOptions,
  type Sep1StellarToml,
  type Sep12CustomerResponse,
  type Sep12PutCustomerRequest,
  type Sep24WithdrawRequest,
  type Sep24WithdrawResponse,
  type Sep24Transaction,
} from './types';

export class AnchorClient {
  readonly sep10: Sep10Client;
  readonly sep12: Sep12Client;
  readonly sep24: Sep24Client;

  constructor(private readonly options: AnchorClientOptions = {}) {
    this.sep10 = new Sep10Client(this.options);
    this.sep12 = new Sep12Client(this.options);
    this.sep24 = new Sep24Client(this.options);
  }

  /**
   * Discover anchor SEP endpoints and supported assets via stellar.toml.
   */
  async discoverToml(domainOrUrl: string): Promise<Sep1StellarToml> {
    return discoverStellarToml(domainOrUrl, { timeoutMs: this.options.timeoutMs });
  }

  /**
   * Request SEP-10 challenge XDR.
   */
  async getAuthChallenge(
    authEndpoint: string,
    account: string,
    options?: { homeDomain?: string | undefined; clientDomain?: string | undefined },
  ): Promise<{ transaction: string; networkPassphrase?: string }> {
    return this.sep10.getChallenge(authEndpoint, account, {
      ...options,
      timeoutMs: this.options.timeoutMs,
    });
  }

  /**
   * Submit signed SEP-10 challenge XDR to obtain JWT.
   */
  async submitAuthChallenge(
    authEndpoint: string,
    signedTransactionXdr: string,
  ): Promise<{ token: string }> {
    return this.sep10.submitChallenge(authEndpoint, signedTransactionXdr, {
      timeoutMs: this.options.timeoutMs,
    });
  }

  /**
   * Fetch customer KYC information under SEP-12.
   */
  async getCustomerKyc(
    kycServer: string,
    token: string,
    query?: {
      id?: string | undefined;
      account?: string | undefined;
      memo?: string | undefined;
      type?: string | undefined;
    },
  ): Promise<Sep12CustomerResponse> {
    return this.sep12.getCustomer(kycServer, token, query);
  }

  /**
   * Submit customer KYC data under SEP-12.
   */
  async putCustomerKyc(
    kycServer: string,
    token: string,
    data: Sep12PutCustomerRequest,
  ): Promise<Sep12CustomerResponse> {
    return this.sep12.putCustomer(kycServer, token, data);
  }

  /**
   * Initiate SEP-24 interactive withdrawal flow.
   */
  async initiateWithdraw(
    transferServer: string,
    token: string,
    params: Sep24WithdrawRequest,
  ): Promise<Sep24WithdrawResponse> {
    return this.sep24.initiateWithdraw(transferServer, token, params);
  }

  /**
   * Poll status of SEP-24 withdrawal transaction.
   */
  async getTransaction(
    transferServer: string,
    token: string,
    transactionId: string,
  ): Promise<Sep24Transaction> {
    return this.sep24.getTransaction(transferServer, token, transactionId);
  }
}
