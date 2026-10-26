'use client';

import * as React from 'react';
import { Button } from '@lumenflow/ui';
import type { Asset } from '@lumenflow/shared-types';

export interface TrustlineDialogProps {
  isOpen: boolean;
  asset: Asset;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const TrustlineDialog: React.FC<TrustlineDialogProps> = ({
  isOpen,
  asset,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trustline-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-4">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h3
          id="trustline-title"
          className="text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          Trustline & Reserve Requirement
        </h3>

        <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <p>
            To hold and receive <strong>{asset.code}</strong> on Stellar, an initial trustline is required.
          </p>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <h5 className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
              Plain-language explanation:
            </h5>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Stellar reserves <strong>0.5 XLM</strong> of your balance to establish this trustline.
              This 0.5 XLM is locked on the ledger (not spent) and is automatically unlocked if you close the trustline in the future.
            </p>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            This transaction includes a <code className="font-mono text-blue-600 dark:text-blue-400">changeTrust</code> operation bundled automatically before the swap.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
            className="font-semibold bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500"
          >
            I Understand, Proceed to Sign
          </Button>
        </div>
      </div>
    </div>
  );
};
