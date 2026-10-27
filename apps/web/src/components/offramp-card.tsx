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
import type { Asset, OfframpQuote, Order } from '@lumenflow/shared-types';
import { useWalletStore } from '../store/wallet-store';
import { ApiService } from '../services/api';
import { WalletModal } from './wallet-modal';

const DEFAULT_SOURCE_ASSET: Asset = {
  type: 'credit_alphanum4',
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

const SUPPORTED_OFFRAMP_ASSETS: Asset[] = [
  DEFAULT_SOURCE_ASSET,
  {
    type: 'credit_alphanum4',
    code: 'EURC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
  {
    type: 'native',
    code: 'XLM',
  },
];

const FIAT_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira (NGN)', symbol: '₦' },
  { code: 'KES', name: 'Kenyan Shilling (KES)', symbol: 'KSh' },
  { code: 'GHS', name: 'Ghanaian Cedi (GHS)', symbol: 'GH₵' },
];

export type OfframpStep = 'amount' | 'kyc' | 'interactive' | 'signing' | 'tracking';

export const OfframpCard: React.FC = () => {
  const { publicKey, jwtToken, signTransaction } = useWalletStore();
  const isConnected = Boolean(publicKey);
  const [currentStep, setCurrentStep] = React.useState<OfframpStep>('amount');

  // Step 1: Amount & Currency
  const [sourceAsset, setSourceAsset] = React.useState<Asset>(DEFAULT_SOURCE_ASSET);
  const [fiatCurrency, setFiatCurrency] = React.useState<string>('NGN');
  const [amount, setAmount] = React.useState<string>('100');
  const [quote, setQuote] = React.useState<OfframpQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = React.useState<boolean>(false);
  const [quoteSecondsLeft, setQuoteSecondsLeft] = React.useState<number>(600);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);

  // Step 2 & 3: KYC and Anchor details
  const [activeOrder, setActiveOrder] = React.useState<Order | null>(null);
  const [interactiveUrl, setInteractiveUrl] = React.useState<string | null>(null);
  const [anchorTxId, setAnchorTxId] = React.useState<string | null>(null);
  const [bankName, setBankName] = React.useState('Access Bank');
  const [accountNumber, setAccountNumber] = React.useState('0123456789');
  const [accountName, setAccountName] = React.useState('Jane Doe');
  const [isSubmittingDetails, setIsSubmittingDetails] = React.useState(false);

  // Step 4: Signing
  const [isSigning, setIsSigning] = React.useState(false);
  const [anchorDepositAccount, setAnchorDepositAccount] = React.useState<string>('GB54GB4VDDWRDWQDGYEFX5UWFEQP7B73HRGWGCU3LDFWCU3HJ5O5N5CW');
  const [anchorMemo, setAnchorMemo] = React.useState<string>('lf-839211');

  // Step 5: Tracking
  const [trackedOrder, setTrackedOrder] = React.useState<Order | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = React.useState(false);

  // Debounced quote fetch
  React.useEffect(() => {
    let isCancelled = false;
    const fetchQuote = async () => {
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setQuote(null);
        return;
      }

      setIsLoadingQuote(true);
      setQuoteError(null);
      try {
        const fetchedQuote = await ApiService.getOfframpQuote(
          sourceAsset,
          fiatCurrency,
          parsedAmount.toFixed(7),
          jwtToken,
        );
        if (!isCancelled) {
          setQuote(fetchedQuote);
          setQuoteSecondsLeft(fetchedQuote.rateLockDurationSeconds);
        }
      } catch (err) {
        if (!isCancelled) {
          setQuoteError(err instanceof Error ? err.message : 'Failed to fetch offramp quote');
          setQuote(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingQuote(false);
        }
      }
    };

    const timer = setTimeout(() => {
      void fetchQuote();
    }, 400);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [amount, sourceAsset, fiatCurrency, jwtToken]);

  // Rate-lock countdown timer
  React.useEffect(() => {
    if (!quote || quoteSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setQuoteSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [quote, quoteSecondsLeft]);

  // Format seconds to mm:ss
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Step indicator items
  const stepperSteps: StepItem[] = [
    {
      id: 'amount',
      label: 'Quote',
      description: 'Asset & amount',
      state: currentStep === 'amount' ? 'current' : 'completed',
    },
    {
      id: 'kyc',
      label: 'KYC Tier',
      description: 'Limits check',
      state:
        currentStep === 'kyc'
          ? 'current'
          : ['interactive', 'signing', 'tracking'].includes(currentStep)
          ? 'completed'
          : 'upcoming',
    },
    {
      id: 'interactive',
      label: 'Bank Details',
      description: 'Anchor payout info',
      state:
        currentStep === 'interactive'
          ? 'current'
          : ['signing', 'tracking'].includes(currentStep)
          ? 'completed'
          : 'upcoming',
    },
    {
      id: 'signing',
      label: 'Sign Payment',
      description: 'Non-custodial transfer',
      state:
        currentStep === 'signing'
          ? 'current'
          : currentStep === 'tracking'
          ? 'completed'
          : 'upcoming',
    },
    {
      id: 'tracking',
      label: 'Status',
      description: 'Payout tracking',
      state: currentStep === 'tracking' ? 'current' : 'upcoming',
    },
  ];

  // Handler: Proceed to KYC
  const handleProceedToKyc = () => {
    if (!isConnected) {
      setIsWalletModalOpen(true);
      return;
    }
    setCurrentStep('kyc');
  };

  // Handler: Create offramp order & open interactive step
  const handleProceedToInteractive = async () => {
    if (!quote || !publicKey) return;
    setIsSubmittingDetails(true);
    try {
      const result = await ApiService.createOfframpOrder(
        quote.id,
        publicKey,
        { bankName, accountNumber, accountName },
        jwtToken,
      );
      setActiveOrder(result.order);
      setInteractiveUrl(result.interactiveUrl);
      setAnchorTxId(result.anchorTxId);
      setCurrentStep('interactive');
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Failed to create offramp order');
    } finally {
      setIsSubmittingDetails(false);
    }
  };

  // Handler: Complete interactive anchor details submission
  const handleCompleteInteractive = async () => {
    setIsSubmittingDetails(true);
    try {
      if (anchorTxId) {
        const anchorPort = process.env['NEXT_PUBLIC_MOCK_ANCHOR_PORT'] ?? '4001';
        try {
          const res = await fetch(`http://localhost:${anchorPort}/interactive/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              transaction_id: anchorTxId,
              bank_name: bankName,
              account_number: accountNumber,
              account_name: accountName,
            }).toString(),
          });
          if (res.ok) {
            const data = (await res.json()) as { transaction?: { withdraw_anchor_account?: string; withdraw_memo?: string } };
            if (data.transaction?.withdraw_anchor_account) {
              setAnchorDepositAccount(data.transaction.withdraw_anchor_account);
            }
            if (data.transaction?.withdraw_memo) {
              setAnchorMemo(data.transaction.withdraw_memo);
            }
          }
        } catch {
          // If direct anchor fetch fails, use defaults
        }
      }
      setCurrentStep('signing');
    } finally {
      setIsSubmittingDetails(false);
    }
  };

  // Handler: Sign Stellar payment to anchor
  const handleSignPayment = async () => {
    if (!activeOrder) return;
    setIsSigning(true);
    try {
      const dummyXdr = 'AAAAAgAAAAD6xtahhF86HnFu3...payment...';
      await signTransaction(dummyXdr);

      // Advance to tracking
      setTrackedOrder({
        ...activeOrder,
        status: 'PROCESSING',
      });
      setCurrentStep('tracking');

      // Trigger automatic simulation callback to API
      const anchorPort = process.env['NEXT_PUBLIC_MOCK_ANCHOR_PORT'] ?? '4001';
      void fetch(`http://localhost:${anchorPort}/api/trigger-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activeOrder.id,
          status: 'completed',
          externalId: anchorTxId,
          amount: quote?.sourceAmount,
        }),
      }).then(() => {
        setTrackedOrder((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
      }).catch(() => {
        setTrackedOrder((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
      });
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Wallet signature failed');
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <>
      <div className="w-full max-w-xl mx-auto space-y-6">
        {/* Step Progress Stepper */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <Stepper steps={stepperSteps} />
        </div>

        {/* Step 1: Amount & Currency Selection */}
        {currentStep === 'amount' && (
          <Card className="border-slate-200 shadow-md dark:border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold">Crypto Offramp</CardTitle>
                  <CardDescription>
                    Convert stablecoins directly to local bank currency via Stellar SEPs
                  </CardDescription>
                </div>
                <StatusBadge status="QUOTED" />
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Asset and Amount Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>Send Crypto</span>
                  <div className="flex gap-2">
                    {SUPPORTED_OFFRAMP_ASSETS.map((asset) => (
                      <button
                        key={asset.code}
                        type="button"
                        onClick={() => setSourceAsset(asset)}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${
                          sourceAsset.code === asset.code
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {asset.code}
                      </button>
                    ))}
                  </div>
                </div>

                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  placeholder="0.00"
                  assetSymbol={sourceAsset.code}
                  label="Amount to cash out"
                />
              </div>

              {/* Destination Currency Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Receive Local Fiat Currency
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {FIAT_CURRENCIES.map((fiat) => (
                    <button
                      key={fiat.code}
                      type="button"
                      onClick={() => setFiatCurrency(fiat.code)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-sm font-semibold transition-all ${
                        fiatCurrency === fiat.code
                          ? 'border-blue-600 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-300 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-lg">{fiat.symbol}</span>
                      <span className="text-xs mt-1">{fiat.code}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quote Result & Fee Breakdown */}
              {quote && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Expected Payout
                    </span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {fiatCurrency === 'NGN' ? '₦' : fiatCurrency === 'KES' ? 'KSh ' : 'GH₵ '}
                      {Number(quote.destinationAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>Exchange Rate</span>
                    <span className="font-mono font-medium">
                      1 {sourceAsset.code} ≈ {quote.exchangeRate} {fiatCurrency}
                    </span>
                  </div>

                  {/* Rate-lock Countdown */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-blue-100 dark:border-blue-900/30">
                    <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Rate Guaranteed
                    </span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      ⏱ {formatTimer(quoteSecondsLeft)} remaining
                    </span>
                  </div>

                  {/* Fee Breakdown */}
                  <div className="space-y-1.5 pt-2 border-t border-blue-100 dark:border-blue-900/30 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span>Partner Anchor Fee</span>
                      <span className="font-mono">{quote.feeBreakdown.anchorFee} {sourceAsset.code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Stellar Network Fee</span>
                      <span className="font-mono">{quote.feeBreakdown.networkFee} XLM</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Platform Fee (0.25%)</span>
                      <span className="font-mono">{quote.feeBreakdown.platformFee} {sourceAsset.code}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-200 pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span>Total Fees</span>
                      <span className="font-mono">{quote.feeBreakdown.totalFee} {sourceAsset.code}</span>
                    </div>
                  </div>
                </div>
              )}

              {quoteError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  {quoteError}
                </div>
              )}
            </CardContent>

            <CardFooter>
              <Button
                variant="default"
                size="lg"
                className="w-full font-bold text-base"
                disabled={isLoadingQuote || !quote || parseFloat(amount) <= 0}
                onClick={handleProceedToKyc}
              >
                {!isConnected
                  ? 'Connect Wallet to Continue'
                  : isLoadingQuote
                  ? 'Fetching Live Rate...'
                  : 'Continue to KYC Verification'}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2: KYC Status Check */}
        {currentStep === 'kyc' && (
          <Card className="border-slate-200 shadow-md dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-xl font-bold">KYC Verification Status</CardTitle>
              <CardDescription>
                Tiered limits aligned with Stellar SEP-12 compliance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Active Verification Level
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Tier 1 Verified
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 block">Single Order Limit</span>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">$500.00</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 block">24h Daily Limit</span>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">$1,500.00</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50/60 p-3 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                ✓ Your wallet public key is cleared for this transaction. No additional documents are needed for amounts under $500.
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={() => setCurrentStep('amount')}>
                Back
              </Button>
              <Button
                variant="default"
                className="flex-1 font-semibold"
                disabled={isSubmittingDetails}
                onClick={() => void handleProceedToInteractive()}
              >
                {isSubmittingDetails ? 'Opening Anchor Session...' : 'Proceed to Payout Details'}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Anchor Interactive Window */}
        {currentStep === 'interactive' && (
          <Card className="border-slate-200 shadow-md dark:border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold">Anchor Hosted Flow (SEP-24)</CardTitle>
                  <CardDescription>
                    Provide bank destination account for local currency delivery
                  </CardDescription>
                </div>
                <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded dark:bg-slate-800">
                  {anchorTxId?.slice(0, 14)}...
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Select Bank
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                >
                  <option value="Access Bank">Access Bank</option>
                  <option value="GTBank">Guaranty Trust Bank (GTBank)</option>
                  <option value="Zenith Bank">Zenith Bank</option>
                  <option value="First Bank">First Bank of Nigeria</option>
                  <option value="Kuda Bank">Kuda Microfinance Bank</option>
                </select>

                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block pt-1">
                  10-Digit Account Number
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="0123456789"
                  maxLength={10}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-mono dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                />

                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block pt-1">
                  Account Holder Full Name
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {interactiveUrl && (
                <div className="text-[11px] text-slate-500 font-mono break-all bg-slate-50 p-2 rounded dark:bg-slate-900">
                  Anchor Session: {interactiveUrl}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={() => setCurrentStep('kyc')}>
                Back
              </Button>
              <Button
                variant="default"
                className="flex-1 font-semibold"
                disabled={isSubmittingDetails || !accountNumber || accountNumber.length < 8}
                onClick={() => void handleCompleteInteractive()}
              >
                {isSubmittingDetails ? 'Registering Details...' : 'Confirm Payout Details'}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 4: Sign Stellar Payment */}
        {currentStep === 'signing' && (
          <Card className="border-slate-200 shadow-md dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Sign Payment to Anchor</CardTitle>
              <CardDescription>
                Non-custodial transfer: approve sending {quote?.sourceAmount} {sourceAsset.code} to partner anchor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Anchor Recipient Account</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                    {anchorDepositAccount.slice(0, 6)}...{anchorDepositAccount.slice(-6)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Required Transfer Memo</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {anchorMemo}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Destination Fiat Payout</span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {fiatCurrency} {quote?.destinationAmount}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                🔒 Your wallet will now prompt you to review and sign the transaction. LumenFlow never holds your private keys.
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={() => setCurrentStep('interactive')}>
                Back
              </Button>
              <Button
                variant="default"
                className="flex-1 font-bold text-base"
                disabled={isSigning}
                onClick={() => void handleSignPayment()}
              >
                {isSigning ? 'Waiting for Wallet Signature...' : 'Sign in Wallet'}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 5: Status Tracking */}
        {currentStep === 'tracking' && (
          <Card className="border-slate-200 shadow-md dark:border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold">Offramp Progress</CardTitle>
                  <CardDescription>
                    Tracking fiat settlement via partner anchor webhooks
                  </CardDescription>
                </div>
                <StatusBadge
                  status={trackedOrder?.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING'}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Order ID</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {activeOrder?.id.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Delivered To</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {bankName} •••• {accountNumber.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Fiat Amount</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {fiatCurrency} {quote?.destinationAmount}
                  </span>
                </div>
              </div>

              {trackedOrder?.status === 'COMPLETED' ? (
                <div className="rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <div className="text-2xl mb-1">🎉</div>
                  <h4 className="font-bold text-emerald-900 dark:text-emerald-200">
                    Payout Completed!
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                    Funds have been credited to your bank account via partner anchor rail.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center p-4 gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <span className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                  Anchor is transferring local currency to your bank account...
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full font-semibold"
                onClick={() => {
                  setCurrentStep('amount');
                  setQuote(null);
                  setActiveOrder(null);
                  setTrackedOrder(null);
                }}
              >
                Start New Offramp
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </>
  );
};
