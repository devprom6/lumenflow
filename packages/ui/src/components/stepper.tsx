import * as React from 'react';
import { cn } from '../utils/cn';

export type StepState = 'upcoming' | 'current' | 'completed' | 'error';

export interface StepItem {
  id: string;
  label: string;
  description?: string;
  state: StepState;
}

export interface StepperProps {
  steps: StepItem[];
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  className,
  orientation = 'horizontal',
}) => {
  return (
    <nav
      aria-label="Progress steps"
      className={cn('w-full', className)}
    >
      <ol
        className={cn(
          'flex',
          orientation === 'horizontal'
            ? 'items-center justify-between w-full'
            : 'flex-col space-y-4',
        )}
      >
        {steps.map((step, index) => {
          const isCompleted = step.state === 'completed';
          const isCurrent = step.state === 'current';
          const isError = step.state === 'error';
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.id}
              className={cn(
                'relative flex items-center',
                orientation === 'horizontal' ? 'flex-1 last:flex-none' : 'w-full',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div className="flex items-center gap-3">
                {/* Step Circle Icon */}
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold select-none transition-colors',
                    isCompleted &&
                      'bg-emerald-600 text-white dark:bg-emerald-500',
                    isCurrent &&
                      'border-2 border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300 animate-pulse',
                    isError &&
                      'bg-rose-600 text-white dark:bg-rose-500',
                    step.state === 'upcoming' &&
                      'border border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
                  )}
                >
                  {isCompleted ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : isError ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Step Text Info */}
                <div className="flex flex-col">
                  <span
                    className={cn(
                      'text-xs font-medium',
                      isCurrent && 'font-bold text-blue-600 dark:text-blue-400',
                      isCompleted && 'text-slate-900 dark:text-slate-100',
                      isError && 'font-semibold text-rose-600 dark:text-rose-400',
                      step.state === 'upcoming' &&
                        'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {step.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Connecting line */}
              {orientation === 'horizontal' && !isLast && (
                <div
                  className={cn(
                    'mx-4 h-0.5 flex-1',
                    isCompleted
                      ? 'bg-emerald-600 dark:bg-emerald-500'
                      : 'bg-slate-200 dark:bg-slate-700',
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
