import * as React from 'react';
import { cn } from '../utils/cn';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  onDismiss?: (id: string) => void;
  className?: string;
}

const toastVariantStyles: Record<
  ToastVariant,
  { border: string; bg: string; icon: string; text: string }
> = {
  success: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/80',
    icon: 'text-emerald-600 dark:text-emerald-400',
    text: 'text-emerald-900 dark:text-emerald-100',
  },
  error: {
    border: 'border-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/80',
    icon: 'text-rose-600 dark:text-rose-400',
    text: 'text-rose-900 dark:text-rose-100',
  },
  warning: {
    border: 'border-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/80',
    icon: 'text-amber-600 dark:text-amber-400',
    text: 'text-amber-900 dark:text-amber-100',
  },
  info: {
    border: 'border-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/80',
    icon: 'text-blue-600 dark:text-blue-400',
    text: 'text-blue-900 dark:text-blue-100',
  },
};

export const Toast: React.FC<ToastProps> = ({
  id,
  title,
  description,
  variant = 'info',
  onDismiss,
  className,
}) => {
  const styles = toastVariantStyles[variant];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'relative flex w-full items-start gap-3 rounded-xl border p-4 shadow-md transition-all',
        styles.border,
        styles.bg,
        className,
      )}
    >
      <div className={cn('mt-0.5 shrink-0', styles.icon)}>
        {variant === 'success' && (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {variant === 'error' && (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 9l-6 6M9 9l6 6" />
          </svg>
        )}
        {variant === 'warning' && (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )}
        {variant === 'info' && (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16v-4m0-4h.01" />
          </svg>
        )}
      </div>

      <div className="flex-1">
        <h5 className={cn('text-sm font-semibold', styles.text)}>{title}</h5>
        {description && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {description}
          </p>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="Close notification"
          className="ml-auto -mr-1 -mt-1 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};
