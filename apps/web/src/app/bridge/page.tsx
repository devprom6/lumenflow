import type { Metadata } from 'next';
import { BridgeCard } from '../../components/bridge-card';

export const metadata: Metadata = {
  title: 'Cross-Chain Bridge | LumenFlow',
  description: 'Bridge crypto assets between Stellar and external blockchains securely via audited third-party providers.',
};

export default function BridgePage() {
  return (
    <div className="flex flex-col items-center justify-center py-6 pb-28 sm:py-12 sm:pb-12 px-4 sm:px-6">
      <div className="text-center mb-8 max-w-lg">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Cross-Chain Bridge
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Non-custodial bridging between Stellar Testnet and external chains with automated status tracking.
        </p>
      </div>

      <BridgeCard />
    </div>
  );
}
