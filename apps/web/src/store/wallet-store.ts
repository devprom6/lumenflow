import { create } from 'zustand';
import { WalletService } from '../services/wallet';
import type { SupportedWallet } from '../types/wallet';

export interface WalletState {
  publicKey: string | null;
  walletType: SupportedWallet | null;
  jwtToken: string | null;
  user: { id: string; publicKey: string } | null;
  balances: Record<string, string>;
  isConnecting: boolean;
  error: string | null;

  connect: (walletType: SupportedWallet) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string, networkPassphrase?: string) => Promise<string>;
  setBalances: (balances: Record<string, string>) => void;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  publicKey: null,
  walletType: null,
  jwtToken: null,
  user: null,
  balances: {
    XLM: '250.0000000',
    USDC: '75.5000000',
    EURC: '20.0000000',
  },
  isConnecting: false,
  error: null,

  connect: async (walletType: SupportedWallet) => {
    set({ isConnecting: true, error: null });
    try {
      const session = await WalletService.connect(walletType);
      set({
        publicKey: session.publicKey,
        walletType: session.walletType,
        jwtToken: session.token,
        user: session.user,
        isConnecting: false,
      });
    } catch (err: unknown) {
      set({
        isConnecting: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  disconnect: async () => {
    await WalletService.disconnect();
    set({
      publicKey: null,
      walletType: null,
      jwtToken: null,
      user: null,
      error: null,
    });
  },

  signTransaction: async (xdr: string, networkPassphrase?: string) => {
    const { walletType } = get();
    if (!walletType) {
      throw new Error('Wallet not connected');
    }
    return WalletService.signTransaction(xdr, walletType, networkPassphrase);
  },

  setBalances: (balances: Record<string, string>) => {
    set({ balances });
  },

  clearError: () => {
    set({ error: null });
  },
}));
