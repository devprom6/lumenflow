'use client';

import * as React from 'react';
import { Stepper, Button, type StepItem } from '@lumenflow/ui';

export type SwapStep =
  | 'idle'
  | 'awaiting_signature'
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'failed';

export interface SwapProgressModalProps {
  isOpen: boolean;
  step: SwapStep;
  error?: string | null;
  stellarTxHash?: string | null;
  onClose: () => void;
  onRetry?: () => void;
}

export const SwapProgressModal: React.FC<SwapProgressModalProps> = ({
  isOpen,
  step,
  error,
  stellarTxHash,
  onClose,
  onRetry,
}) => {
  if (!isOpen) return null;

  const isCompleted = step === 'completed';
  const isFailed = step === 'failed';

  const steps: StepItem[] = [
    {
      id: 'sign',
      label: 'Sign Transaction',
      description: 'Approve in wallet',
      state:
        step === 'awaiting_signature'
          ? 'current'
          : isFailed
            ? 'error'
            : step === 'idle'
              ? 'upcoming'
              : 'completed',
    },
    {
      id: 'submit',
      label: 'Submit to Horizon',
      description: 'Broadcast to network',
      state:
        step === 'submitted'
          ? 'current'
          : ['processing', 'completed'].includes(step)
            ? 'completed'
            : 'upcoming',
    },
    {
      id: 'confirm',
      label: 'Ledger Confirmation',
      description: 'Recorded on Stellar ledger',
      state:
        step === 'processing'
          ? 'current'
          : isCompleted
            ? 'completed'
            : 'upcoming',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center pb-4 border-b border-slate-100 dark:border-slate-800">
          <h3
            id="progress-modal-title"
            className="text-lg font-bold text-slate-900 dark:text-slate-100"
          >
            {isCompleted
              ? 'Swap Completed Successfully!'
              : isFailed
                ? 'Swap Failed'
                : 'Processing Swap'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Non-custodial execution on Stellar Testnet
          </p>
        </div>

        <div className="my-6">
          <Stepper steps={steps} orientation="vertical" />
        </div>

        {isCompleted && stellarTxHash && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Transaction Confirmed
            </p>
            <a
              href={`https://testnet.stellar.expert/explorer/testnet/tx/${stellarTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-mono font-medium text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
            >
              View on Stellar Expert ({stellarTxHash.slice(0, 8)}...)
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {isFailed && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
          >
            <span className="font-semibold block mb-0.5">Error Details:</span>
            {error ?? 'An unexpected error occurred during submission.'}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          {isFailed && onRetry && (
            <Button
              variant="default"
              size="sm"
              onClick={onRetry}
              className="font-semibold"
            >
              Retry Signing
            </Button>
          )}

          {(isCompleted || isFailed) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
