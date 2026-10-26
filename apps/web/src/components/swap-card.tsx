'use client';

import * as React from 'react';
import type { Asset, Quote } from '@lumenflow/shared-types';
import { Card, CardContent, CardHeader, CardTitle, Button, AmountInput, AssetPicker, type AssetOption } from '@lumenflow/ui';
import { useWalletStore } from '../store/wallet-store';
import { ApiService } from '../services/api';
import { TrustlineDialog } from './trustline-dialog';
import { SwapProgressModal, type SwapStep } from './swap-progress-modal';
import { WalletModal } from './wallet-modal';

const DEFAULT_ASSETS: AssetOption[] = [
  {
    asset: { type: 'native', code: 'XLM' },
    name: 'Stellar Lumens',
    symbol: 'XLM',
    balance: '250.0000000',
  },
  {
    asset: {
      type: 'credit_alphanum4',
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    },
    name: 'USD Coin',
    symbol: 'USDC',
    balance: '75.5000000',
  },
  {
    asset: {
      type: 'credit_alphanum4',
      code: 'EURC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    },
    name: 'Euro Coin',
    symbol: 'EURC',
    balance: '20.0000000',
  },
];

const DEFAULT_SOURCE_ASSET: Asset = { type: 'native', code: 'XLM' };
const DEFAULT_DEST_ASSET: Asset = {
  type: 'credit_alphanum4',
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

export const SwapCard: React.FC = () => {
  const { publicKey, jwtToken, balances, signTransaction } = useWalletStore();

  const [sourceAsset, setSourceAsset] = React.useState<Asset>(DEFAULT_SOURCE_ASSET);
  const [destAsset, setDestAsset] = React.useState<Asset>(DEFAULT_DEST_ASSET);
  const [sourceAmount, setSourceAmount] = React.useState<string>('50');
  const [slippage, setSlippage] = React.useState<number>(0.01); // 1%

  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [isQuoting, setIsQuoting] = React.useState(false);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = React.useState<number>(0);

  // Modals & Progress
  const [isWalletModalOpen, setIsWalletModalOpen] = React.useState(false);
  const [isTrustlineOpen, setIsTrustlineOpen] = React.useState(false);
  const [swapStep, setSwapStep] = React.useState<SwapStep>('idle');
  const [swapError, setSwapError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);

  // Debounced quote fetch
  React.useEffect(() => {
    if (!sourceAmount || Number(sourceAmount) <= 0) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setIsQuoting(true);
        setQuoteError(null);
        try {
          const liveQuote = await ApiService.getQuote(
            sourceAsset,
            destAsset,
            sourceAmount,
            slippage,
            jwtToken,
          );
          setQuote(liveQuote);
          const diffMs = new Date(liveQuote.expiresAt).getTime() - Date.now();
          setSecondsRemaining(Math.max(0, Math.floor(diffMs / 1000)));
        } catch (err: unknown) {
          setQuoteError(err instanceof Error ? err.message : 'Failed to fetch quote');
          setQuote(null);
        } finally {
          setIsQuoting(false);
        }
      })();
    }, 400);

    return () => clearTimeout(timer);
  }, [sourceAsset, destAsset, sourceAmount, slippage, jwtToken]);

  // Quote countdown timer
  React.useEffect(() => {
    if (secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Quote expired: refresh quote
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const handleFlipAssets = () => {
    const prevSource = sourceAsset;
    setSourceAsset(destAsset);
    setDestAsset(prevSource);
    setQuote(null);
  };

  const availableAssetsWithBalances = DEFAULT_ASSETS.map((opt) => ({
    ...opt,
    balance: balances[opt.asset.code] ?? opt.balance,
  }));

  const sourceBalance = balances[sourceAsset.code] ?? '0.00';

  // Initiates swap flow
  const handleSwapClick = async () => {
    if (!publicKey) {
      setIsWalletModalOpen(true);
      return;
    }

    if (!quote) return;

    // Check if destination requires trustline and explanation
    if (destAsset.type !== 'native') {
      setIsTrustlineOpen(true);
      return;
    }

    await proceedWithSigning();
  };

  const proceedWithSigning = async () => {
    if (!quote || !publicKey) return;
    setIsTrustlineOpen(false);
    setSwapStep('awaiting_signature');
    setSwapError(null);

    try {
      // Step 1: Request unsigned XDR
      const buildRes = await ApiService.buildSwap(quote.id, publicKey, jwtToken);

      // Step 2: Prompt user wallet to sign locally
      const signedXdr = await signTransaction(buildRes.unsignedXdr, buildRes.networkPassphrase);

      // Step 3: Submit signed transaction
      setSwapStep('submitted');
      const submitRes = await ApiService.submitSwap(buildRes.orderId, signedXdr, jwtToken);

      setSwapStep('processing');
      setTxHash(submitRes.stellarTxHash);

      // Brief delay to reflect ledger ingestion
      setTimeout(() => {
        setSwapStep('completed');
      }, 1000);
    } catch (err: unknown) {
      setSwapStep('failed');
      setSwapError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <Card className="w-full max-w-lg border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 mx-auto">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">
            Swap
          </CardTitle>

          {/* Slippage Selector */}
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1 text-xs dark:bg-slate-800">
            <span className="text-slate-400 text-[10px] uppercase font-semibold px-1">Slip</span>
            {[0.005, 0.01, 0.02].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlippage(s)}
                className={`rounded px-1.5 py-0.5 font-medium transition-colors cursor-pointer ${
                  slippage === s
                    ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400 font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {(s * 100).toFixed(1)}%
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Source Asset Input */}
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <AmountInput
                  label="You Pay"
                  value={sourceAmount}
                  onChange={setSourceAmount}
                  balance={sourceBalance}
                  onMaxClick={() => setSourceAmount(sourceBalance.split('.')[0] ?? sourceBalance)}
                />
              </div>
              <div className="w-36 pt-5">
                <AssetPicker
                  selectedAsset={sourceAsset}
                  availableAssets={availableAssetsWithBalances}
                  onSelect={setSourceAsset}
                />
              </div>
            </div>
          </div>

          {/* Flip Assets Button */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              type="button"
              onClick={handleFlipAssets}
              aria-label="Switch source and destination assets"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition-transform hover:scale-105 active:scale-95 hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
            >
              <svg className="h-4 w-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Destination Asset Input */}
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <AmountInput
                  label="You Receive (estimated)"
                  value={quote?.destinationAmount ?? ''}
                  onChange={() => {}}
                  readOnly
                  placeholder={isQuoting ? 'Fetching...' : '0.00'}
                />
              </div>
              <div className="w-36 pt-5">
                <AssetPicker
                  selectedAsset={destAsset}
                  availableAssets={availableAssetsWithBalances}
                  onSelect={setDestAsset}
                />
              </div>
            </div>
          </div>

          {/* Live Quote Details Breakdown */}
          {quote && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs space-y-2 dark:border-slate-800 dark:bg-slate-950/50 animate-in fade-in">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Route</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  {quote.path.length === 0 ? (
                    <span>{quote.sourceAsset.code} → {quote.destinationAsset.code} (Direct)</span>
                  ) : (
                    <span>
                      {quote.sourceAsset.code} →{' '}
                      {quote.path.map((p) => p.asset.code).join(' → ')} →{' '}
                      {quote.destinationAsset.code}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Minimum Received</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {quote.minimumReceived} {destAsset.code}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Price Impact</span>
                <span
                  className={`font-semibold ${
                    quote.priceImpact < 0.01
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : quote.priceImpact < 0.03
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {(quote.priceImpact * 100).toFixed(2)}%
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Network & Platform Fees</span>
                <span className="text-slate-700 dark:text-slate-300 font-mono">
                  {quote.networkFee} stroops + {quote.platformFee} {quote.sourceAsset.code}
                </span>
              </div>

              {/* Quote Expiry Countdown */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Quote expires in {secondsRemaining}s
                </span>
                <button
                  type="button"
                  onClick={() => setSourceAmount((val) => val)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  Refresh
                </button>
              </div>
            </div>
          )}

          {quoteError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              {quoteError}
            </div>
          )}

          {/* Action Button */}
          <Button
            size="lg"
            disabled={!publicKey ? false : isQuoting || !quote}
            onClick={() => void handleSwapClick()}
            className="w-full text-base font-bold shadow-md cursor-pointer"
          >
            {!publicKey
              ? 'Connect Wallet to Swap'
              : isQuoting
                ? 'Fetching Best Route...'
                : !quote
                  ? 'Enter an Amount'
                  : 'Swap Assets'}
          </Button>
        </CardContent>
      </Card>

      {/* Trustline Pre-Signing Dialog */}
      <TrustlineDialog
        isOpen={isTrustlineOpen}
        asset={destAsset}
        onConfirm={() => void proceedWithSigning()}
        onCancel={() => setIsTrustlineOpen(false)}
      />

      {/* Progress & Signing Modal */}
      <SwapProgressModal
        isOpen={['awaiting_signature', 'submitted', 'processing', 'completed', 'failed'].includes(swapStep)}
        step={swapStep}
        error={swapError}
        stellarTxHash={txHash}
        onClose={() => setSwapStep('idle')}
        onRetry={() => void proceedWithSigning()}
      />

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </>
  );
};
