'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@lumenflow/ui';
import { useWalletStore } from '../store/wallet-store';
import { WalletModal } from './wallet-modal';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { publicKey, disconnect } = useWalletStore();
  const [isWalletModalOpen, setIsWalletModalOpen] = React.useState(false);

  const truncatedAddress = publicKey
    ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
    : null;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 font-bold tracking-tight text-slate-900 dark:text-white"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-extrabold shadow-sm">
                LF
              </div>
              <span className="text-lg">LumenFlow</span>
            </Link>

            {/* Desktop Navigation links */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              <Link
                href="/"
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  pathname === '/'
                    ? 'bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Swap
              </Link>

              {/* Disabled but visible navigation with tooltip */}
              <div className="relative group">
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-slate-400 cursor-not-allowed dark:text-slate-600"
                  aria-disabled="true"
                >
                  Bridge
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Soon
                  </span>
                </button>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden w-48 rounded-lg bg-slate-900 p-2 text-center text-xs text-slate-200 shadow-xl group-hover:block dark:bg-slate-800 z-50">
                  Cross-chain bridge coming in this build
                </div>
              </div>

              <Link
                href="/offramp"
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  pathname === '/offramp'
                    ? 'bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Offramp
              </Link>

              <Link
                href="/history"
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  pathname === '/history'
                    ? 'bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                History
              </Link>
            </nav>
          </div>

          {/* Right actions: Network Badge & Connect Button */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Testnet
            </span>

            {publicKey ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-mono">{truncatedAddress}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void disconnect()}
                  className="text-xs"
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsWalletModalOpen(true)}
                className="font-semibold"
              >
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95"
      >
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg ${
            pathname === '/'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <span>Swap</span>
        </Link>

        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex flex-col items-center gap-0.5 py-1 px-3 text-xs text-slate-400 cursor-not-allowed dark:text-slate-600"
        >
          <span>Bridge</span>
          <span className="text-[9px] rounded-full bg-slate-100 px-1 dark:bg-slate-800">
            Soon
          </span>
        </button>

        <Link
          href="/offramp"
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg ${
            pathname === '/offramp'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <span>Offramp</span>
        </Link>

        <Link
          href="/history"
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg ${
            pathname === '/history'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
          }`}
        >
          <span>History</span>
        </Link>
      </nav>

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </>
  );
};
