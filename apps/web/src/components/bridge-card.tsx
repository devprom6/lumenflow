'use client';

import * as React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  AmountInput,
  StatusBadge,
  Stepper,
  type StepItem,
} from '@lumenflow/ui';
import type { BridgeQuote, BridgeRoute, Order, TransferStatus, UnsignedTransfer } from '@lumenflow/shared-types';
import { useWalletStore } from '../store/wallet-store';
import { ApiService } from '../services/api';
import { WalletModal } from './wallet-modal';

export type BridgeStep = 'quote' | 'review' | 'sign' | 'tracking';

export interface ChainOption {
  id: string;
  name: string;
  icon: string;
}

const SUPPORTED_CHAINS: ChainOption[] = [
  { id: 'stellar', name: 'Stellar (Testnet)', icon: '⭐' },
  { id: 'ethereum', name: 'Ethereum (Sepolia)', icon: '🔷' },
  { id: 'polygon', name: 'Polygon (Amoy)', icon: '💜' },
  { id: 'solana', name: 'Solana (Devnet)', icon: '☀️' },
];

export const BridgeCard: React.FC = () => {
  const { publicKey, jwtToken, signTransaction } = useWalletStore();
  const isConnected = Boolean(publicKey);
  const [currentStep, setCurrentStep] = React.useState<BridgeStep>('quote');

  // Route & Parameters
  const [fromChain, setFromChain] = React.useState<string>('stellar');
  const [toChain, setToChain] = React.useState<string>('ethereum');
  const [asset] = React.useState<string>('USDC');
  const [amount, setAmount] = React.useState<string>('100');
  const [destinationRecipient, setDestinationRecipient] = React.useState<string>('0x71C...b48');

  // Quotes and Routes
  const [_routes, setRoutes] = React.useState<BridgeRoute[]>([]);
  const [quote, setQuote] = React.useState<BridgeQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = React.useState<boolean>(false);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);

  // Active Transfer & Order State
  const [activeOrder, setActiveOrder] = React.useState<Order | null>(null);
  const [unsignedTransfer, setUnsignedTransfer] = React.useState<UnsignedTransfer | null>(null);
  const [transferStatus, setTransferStatus] = React.useState<TransferStatus | null>(null);

  // Interaction State
  const [isInitiating, setIsInitiating] = React.useState<boolean>(false);
  const [isSigning, setIsSigning] = React.useState<boolean>(false);
  const [signError, setSignError] = React.useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = React.useState<boolean>(false);

  // Load available routes
  React.useEffect(() => {
    let cancelled = false;
    const loadRoutes = async () => {
      try {
        const data = await ApiService.getBridgeRoutes(jwtToken);
        if (!cancelled) setRoutes(data);
      } catch {
        // Fallback handled in ApiService
      }
    };
    void loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  // Fetch Bridge Quote with debounce
  React.useEffect(() => {
    let cancelled = false;
    const fetchQuote = async () => {
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setQuote(null);
        return;
      }

      setIsLoadingQuote(true);
      setQuoteError(null);
      try {
        const fetchedQuote = await ApiService.getBridgeQuote(
          {
            fromChain,
            toChain,
            fromAsset: asset,
            toAsset: asset,
            amount: parsedAmount.toString(),
          },
          jwtToken,
        );
        if (!cancelled) {
          setQuote(fetchedQuote);
          setIsLoadingQuote(false);
        }
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setIsLoadingQuote(false);
          setQuoteError(err instanceof Error ? err.message : 'Route temporarily unavailable');
        }
      }
    };

    const timer = setTimeout(() => {
      void fetchQuote();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fromChain, toChain, asset, amount, jwtToken]);

  // Polling transfer status during tracking step
  React.useEffect(() => {
    if (currentStep !== 'tracking' || !activeOrder) return;

    let cancelled = false;
    const checkStatus = async () => {
      try {
        const res = await ApiService.getBridgeTransferStatus(
          unsignedTransfer?.transferId ?? activeOrder.id,
          jwtToken,
        );
        if (!cancelled) {
          setActiveOrder(res.order);
          if (res.status) setTransferStatus(res.status);
        }
      } catch {
        // Silently retry
      }
    };

    void checkStatus();
    const interval = setInterval(() => {
      void checkStatus();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentStep, activeOrder, unsignedTransfer, jwtToken]);

  const handleSwapChains = () => {
    const temp = fromChain;
    setFromChain(toChain);
    setToChain(temp);
  };

  const handleInitiateTransfer = async () => {
    if (!quote) return;
    if (!isConnected) {
      setIsWalletModalOpen(true);
      return;
    }

    setIsInitiating(true);
    setQuoteError(null);
    try {
      const result = await ApiService.initiateBridgeTransfer(
        quote.id,
        publicKey ?? 'G_SENDER',
        destinationRecipient,
        jwtToken,
      );
      setActiveOrder(result.order);
      setUnsignedTransfer(result.transfer);
      setCurrentStep('sign');
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Failed to initiate transfer');
    } finally {
      setIsInitiating(false);
    }
  };

  const handleSignTransfer = async () => {
    if (!unsignedTransfer) return;
    setIsSigning(true);
    setSignError(null);

    try {
      // Simulate client wallet signing non-custodial transaction
      if (signTransaction) {
        await signTransaction(unsignedTransfer.unsignedTransaction);
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }

      // Progress to tracking
      setCurrentStep('tracking');
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Wallet signature failed or rejected');
    } finally {
      setIsSigning(false);
    }
  };

  const stepperSteps: StepItem[] = [
    {
      id: 'quote',
      label: 'Quote',
      description: 'Route & Fee',
      state: currentStep === 'quote' ? 'current' : 'completed',
    },
    {
      id: 'review',
      label: 'Review',
      description: 'Confirm Details',
      state:
        currentStep === 'review'
          ? 'current'
          : currentStep === 'quote'
            ? 'upcoming'
            : 'completed',
    },
    {
      id: 'sign',
      label: 'Sign',
      description: 'Wallet Signing',
      state:
        currentStep === 'sign'
          ? 'current'
          : currentStep === 'tracking'
            ? 'completed'
            : 'upcoming',
    },
    {
      id: 'tracking',
      label: 'Status',
      description: 'Delivery',
      state: currentStep === 'tracking' ? 'current' : 'upcoming',
    },
  ];

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {/* Stepper Header */}
      <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl p-4 border border-slate-200/60 dark:border-slate-800/60">
        <Stepper steps={stepperSteps} />
      </div>

      <Card className="shadow-lg border-slate-200/80 dark:border-slate-800/80">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <span className="text-blue-600 dark:text-blue-400">🌉</span>
              Cross-Chain Bridge
            </CardTitle>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300">
              Audited Adapters Only
            </span>
          </div>
          <CardDescription>
            Move assets securely across Stellar and external blockchains via audited bridge providers.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* STEP 1: QUOTE / ROUTE SELECTION */}
          {currentStep === 'quote' && (
            <div className="space-y-4">
              {/* Chains Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Source Network
                  </label>
                  <select
                    value={fromChain}
                    onChange={(e) => setFromChain(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {SUPPORTED_CHAINS.map((c) => (
                      <option key={`from-${c.id}`} value={c.id} disabled={c.id === toChain}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Destination Network
                  </label>
                  <select
                    value={toChain}
                    onChange={(e) => setToChain(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {SUPPORTED_CHAINS.map((c) => (
                      <option key={`to-${c.id}`} value={c.id} disabled={c.id === fromChain}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Switch button */}
                <button
                  type="button"
                  onClick={handleSwapChains}
                  title="Swap directions"
                  className="sm:hidden flex items-center justify-center py-1 text-xs text-blue-600 font-semibold"
                >
                  ⇅ Switch Networks
                </button>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Transfer Amount
                </label>
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  assetSymbol={asset}
                  label="Send"
                  disabled={isLoadingQuote}
                />
              </div>

              {/* Destination Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Destination Wallet Recipient
                </label>
                <input
                  type="text"
                  value={destinationRecipient}
                  onChange={(e) => setDestinationRecipient(e.target.value)}
                  placeholder="0x... or Stellar address"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Error Message */}
              {quoteError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                  ⚠️ {quoteError}
                </div>
              )}

              {/* Quote Breakdown */}
              {quote && !quoteError && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                    <span>Provider</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{quote.provider} (Audited)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">You Receive</span>
                    <span className="font-bold text-slate-900 dark:text-white text-base">
                      ~{quote.toAmount} {quote.toAsset}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                    <span>Bridge & Network Fee</span>
                    <span>{quote.fee.amount} {quote.fee.asset}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                    <span>Estimated Settlement</span>
                    <span>~{Math.round(quote.estimatedDurationSeconds / 60)} minutes</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: REVIEW */}
          {currentStep === 'review' && quote && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 p-4 space-y-3">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  Review Cross-Chain Order
                </h4>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Route</span>
                  <span className="font-medium text-slate-900 dark:text-white capitalize">
                    {quote.fromChain} → {quote.toChain}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sending</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {quote.fromAmount} {quote.fromAsset}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Estimated Receiving</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {quote.toAmount} {quote.toAsset}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Recipient</span>
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {destinationRecipient}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SIGNING STEP */}
          {currentStep === 'sign' && unsignedTransfer && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                  <span>🔐</span>
                  Non-Custodial Wallet Signing
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Your funds remain under your control. Sign the unsigned bridge deposit transaction locally in your wallet to dispatch the transfer.
                </p>
                <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transfer ID:</span>
                    <span className="text-slate-800 dark:text-slate-200">{unsignedTransfer.transferId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bridge Vault:</span>
                    <span className="text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                      {unsignedTransfer.depositAddress}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Memo / Tag:</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">{unsignedTransfer.memo}</span>
                  </div>
                </div>
              </div>

              {signError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                  ⚠️ {signError}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: TRACKING STEP */}
          {currentStep === 'tracking' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Status</span>
                  <StatusBadge
                    status={
                      activeOrder?.status === 'COMPLETED' || transferStatus?.status === 'COMPLETED'
                        ? 'COMPLETED'
                        : activeOrder?.status === 'FAILED' || transferStatus?.status === 'FAILED'
                          ? 'FAILED'
                          : 'PROCESSING'
                    }
                  />
                </div>

                <div className="space-y-2 text-sm pt-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Source Hash</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                      {transferStatus?.fromTxHash ?? 'Confirmed on source'}
                    </span>
                  </div>
                  {transferStatus?.toTxHash && (
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Destination Hash</span>
                      <span className="font-mono text-blue-600 dark:text-blue-400 truncate max-w-[180px]">
                        {transferStatus.toTxHash}
                      </span>
                    </div>
                  )}
                  {transferStatus?.confirmations !== undefined && (
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Confirmations</span>
                      <span>
                        {transferStatus.confirmations} / {transferStatus.requiredConfirmations ?? 24}
                      </span>
                    </div>
                  )}
                </div>

                {(activeOrder?.status === 'COMPLETED' || transferStatus?.status === 'COMPLETED') && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 p-3 text-center text-xs text-green-700 dark:text-green-300 font-semibold">
                    🎉 Bridge transfer completed successfully! Funds delivered on destination chain.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {currentStep === 'quote' && (
            <Button
              className="w-full"
              size="lg"
              disabled={!quote || isLoadingQuote || Boolean(quoteError)}
              onClick={() => setCurrentStep('review')}
            >
              Review Transfer
            </Button>
          )}

          {currentStep === 'review' && (
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="w-1/3"
                onClick={() => setCurrentStep('quote')}
              >
                Back
              </Button>
              <Button
                className="w-2/3"
                size="lg"
                isLoading={isInitiating}
                onClick={() => void handleInitiateTransfer()}
              >
                Continue to Sign
              </Button>
            </div>
          )}

          {currentStep === 'sign' && (
            <Button
              className="w-full"
              size="lg"
              isLoading={isSigning}
              onClick={() => void handleSignTransfer()}
            >
              Sign & Broadcast Transaction
            </Button>
          )}

          {currentStep === 'tracking' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setCurrentStep('quote');
                setActiveOrder(null);
                setUnsignedTransfer(null);
                setTransferStatus(null);
              }}
            >
              Start New Bridge Transfer
            </Button>
          )}
        </CardFooter>
      </Card>

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </div>
  );
};
