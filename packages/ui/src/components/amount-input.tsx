import * as React from 'react';
import { cn } from '../utils/cn';

export interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  assetSymbol?: string;
  assetIcon?: React.ReactNode;
  balance?: string;
  onMaxClick?: () => void;
  disabled?: boolean;
  error?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChange,
  assetSymbol,
  assetIcon,
  balance,
  onMaxClick,
  disabled = false,
  error,
  label = 'Amount',
  placeholder = '0.00',
  className,
  readOnly = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow digits and a single decimal point
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      onChange(val);
    }
  };

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
        <label htmlFor="amount-input" className="select-none">
          {label}
        </label>
        {balance !== undefined && (
          <div className="flex items-center gap-1.5">
            <span>Balance: {balance}</span>
            {onMaxClick && !disabled && !readOnly && (
              <button
                type="button"
                onClick={onMaxClick}
                className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 uppercase cursor-pointer"
                aria-label={`Use maximum balance of ${balance}`}
              >
                Max
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          'relative flex items-center rounded-xl border bg-slate-50 px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 dark:bg-slate-900',
          error
            ? 'border-red-500 focus-within:ring-red-500'
            : 'border-slate-200 dark:border-slate-800',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <input
          id="amount-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? 'amount-input-error' : undefined}
          className="w-full bg-transparent text-xl font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 disabled:cursor-not-allowed"
        />

        {(assetSymbol || assetIcon) && (
          <div className="ml-2 flex items-center gap-1.5 select-none rounded-lg bg-white px-2.5 py-1 text-sm font-semibold shadow-xs border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
            {assetIcon}
            {assetSymbol && (
              <span className="text-slate-900 dark:text-slate-100">{assetSymbol}</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <p
          id="amount-input-error"
          role="alert"
          className="text-xs text-red-600 dark:text-red-400 mt-1"
        >
          {error}
        </p>
      )}
    </div>
  );
};
