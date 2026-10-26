import { ApiService, VerifyResponse } from './api';
import type { SupportedWallet } from '../types/wallet';

declare global {
  interface Window {
    __LUMENFLOW_TEST_WALLET__?: {
      publicKey: string;
      signTransaction: (xdr: string, networkPassphrase?: string) => Promise<{ signedTxXdr: string }>;
    };
  }
}

export interface WalletSession {
  publicKey: string;
  walletType: SupportedWallet;
  token: string;
  user: VerifyResponse['user'];
}

export class WalletService {
  /**
   * Connects the specified wallet and executes SEP-10 wallet authentication flow.
   * Server NEVER receives or touches a private key.
   */
  static async connect(walletType: SupportedWallet): Promise<WalletSession> {
    if (typeof window === 'undefined') {
      throw new Error('Wallet connection must be initialized in browser environment');
    }

    let publicKey: string;

    // Handle Testnet Dev / Playwright Test Wallet
    if (walletType === 'testnet-dev' || window.__LUMENFLOW_TEST_WALLET__) {
      publicKey =
        window.__LUMENFLOW_TEST_WALLET__?.publicKey ??
        'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';
    } else {
      // Browser Extension / Stellar Wallets Kit
      try {
        const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit');
        const addrRes = await StellarWalletsKit.getAddress();
        publicKey = typeof addrRes === 'string' ? addrRes : addrRes.address;
        if (!publicKey) {
          throw new Error('No public key returned from wallet');
        }
      } catch (err: unknown) {
        throw new Error(
          `Failed to connect to ${walletType}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }

    // Step 1: Request SEP-10 challenge from API
    const challenge = await ApiService.getChallenge(publicKey);

    // Step 2: Request client-side wallet signature for the SEP-10 challenge
    const signedChallengeXdr = await this.signTransaction(
      challenge.transaction,
      walletType,
      challenge.networkPassphrase,
    );

    // Step 3: Verify signed SEP-10 challenge and obtain session JWT
    const verifyResult = await ApiService.verifyChallenge(signedChallengeXdr);

    return {
      publicKey,
      walletType,
      token: verifyResult.token,
      user: verifyResult.user,
    };
  }

  /**
   * Requests client-side signature of an unsigned transaction XDR.
   */
  static async signTransaction(
    xdr: string,
    walletType: SupportedWallet,
    networkPassphrase?: string,
  ): Promise<string> {
    if (typeof window === 'undefined') {
      throw new Error('Signing must occur in browser environment');
    }

    // Test wallet provider (for E2E tests and scripted UI runs)
    if (walletType === 'testnet-dev' || window.__LUMENFLOW_TEST_WALLET__) {
      if (window.__LUMENFLOW_TEST_WALLET__) {
        const res = await window.__LUMENFLOW_TEST_WALLET__.signTransaction(xdr, networkPassphrase);
        return res.signedTxXdr;
      }

      // Default mock signature simulation for demo/dev wallet
      return xdr;
    }

    // Stellar Wallets Kit signing
    const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit');
    const result = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase,
    });

    if (typeof result === 'string') {
      return result;
    } else if (result && 'signedTxXdr' in result) {
      return (result as { signedTxXdr: string }).signedTxXdr;
    }

    throw new Error('Wallet did not return signed transaction XDR');
  }

  static async disconnect(): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit');
        await StellarWalletsKit.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
  }
}
