'use client';

import * as React from 'react';
import { SwapCard } from '../components/swap-card';

export default function SwapPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-lg mb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Swap on Stellar
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Non-custodial, low-fee decentralized swaps across Stellar DEX order books and liquidity pools.
        </p>
      </div>

      <SwapCard />
    </div>
  );
}
