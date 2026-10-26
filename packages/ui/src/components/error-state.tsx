import * as React from 'react';
import { cn } from '../utils/cn';
import { Button } from './button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  details,
  onRetry,
  retryLabel = 'Try Again',
  className,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400 mb-3">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01" />
        </svg>
      </div>

      <h4 className="text-base font-semibold text-rose-900 dark:text-rose-200">
        {title}
      </h4>
      <p className="mt-1 max-w-md text-xs text-rose-700 dark:text-rose-300">
        {message}
      </p>

      {details && (
        <div className="mt-3 w-full max-w-md text-left">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] font-medium text-rose-600 underline hover:text-rose-700 dark:text-rose-400 cursor-pointer"
          >
            {showDetails ? 'Hide technical details' : 'Show technical details'}
          </button>
          {showDetails && (
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-rose-100/70 p-2 text-[10px] text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 font-mono">
              {details}
            </pre>
          )}
        </div>
      )}

      {onRetry && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onRetry}
          className="mt-4"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
};
