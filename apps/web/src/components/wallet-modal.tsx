'use client';

import * as React from 'react';
import { SUPPORTED_WALLETS, type SupportedWallet } from '../types/wallet';
import { useWalletStore } from '../store/wallet-store';

export interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const { connect, isConnecting, error, clearError } = useWalletStore();
  const [selectedWallet, setSelectedWallet] = React.useState<SupportedWallet | null>(null);

  if (!isOpen) return null;

  const handleSelect = async (walletId: SupportedWallet) => {
    setSelectedWallet(walletId);
    clearError();
    try {
      await connect(walletId);
      onClose();
    } catch {
      // Error is stored in walletStore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3
              id="wallet-modal-title"
              className="text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Connect Stellar Wallet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Non-custodial: Sign in with your wallet identity (SEP-10).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet modal"
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="my-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {SUPPORTED_WALLETS.map((w) => {
            const isCurrentConnecting = isConnecting && selectedWallet === w.id;

            return (
              <button
                key={w.id}
                type="button"
                disabled={isConnecting}
                onClick={() => void handleSelect(w.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left transition-all hover:border-blue-500 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/20 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white shadow-xs">
                    {w.icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {w.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {w.description}
                    </p>
                  </div>
                </div>

                {isCurrentConnecting ? (
                  <svg
                    className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-2.5 text-center text-[11px] text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          Connected to <span className="font-semibold text-blue-600 dark:text-blue-400">Stellar Testnet</span>. Never submit mainnet funds.
        </div>
      </div>
    </div>
  );
};
