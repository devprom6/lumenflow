import * as React from 'react';
import type { OrderStatus } from '@lumenflow/shared-types';
import { cn } from '../utils/cn';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: OrderStatus;
}

const statusStyles: Record<
  OrderStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  CREATED: {
    label: 'Created',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  QUOTED: {
    label: 'Quoted',
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  AWAITING_SIGNATURE: {
    label: 'Awaiting Signature',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500 animate-pulse',
  },
  SUBMITTED: {
    label: 'Submitted',
    bg: 'bg-indigo-50 dark:bg-indigo-950/50',
    text: 'text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500 animate-pulse',
  },
  PROCESSING: {
    label: 'Processing',
    bg: 'bg-cyan-50 dark:bg-cyan-950/50',
    text: 'text-cyan-700 dark:text-cyan-300',
    dot: 'bg-cyan-500 animate-spin',
  },
  COMPLETED: {
    label: 'Completed',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  FAILED: {
    label: 'Failed',
    bg: 'bg-rose-50 dark:bg-rose-950/50',
    text: 'text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  EXPIRED: {
    label: 'Expired',
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-600 dark:text-zinc-400',
    dot: 'bg-zinc-400',
  },
  REFUNDED: {
    label: 'Refunded',
    bg: 'bg-purple-50 dark:bg-purple-950/50',
    text: 'text-purple-700 dark:text-purple-300',
    dot: 'bg-purple-500',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className,
  ...props
}) => {
  const config = statusStyles[status] ?? {
    label: status,
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-400',
  };

  return (
    <span
      role="status"
      aria-label={`Status: ${config.label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold select-none',
        config.bg,
        config.text,
        className,
      )}
      {...props}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', config.dot)}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
};
