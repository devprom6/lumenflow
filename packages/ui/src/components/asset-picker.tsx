import * as React from 'react';
import type { Asset } from '@lumenflow/shared-types';
import { cn } from '../utils/cn';

export interface AssetOption {
  asset: Asset;
  name: string;
  symbol: string;
  balance?: string;
  icon?: string;
  verified?: boolean;
}

export interface AssetPickerProps {
  selectedAsset: Asset;
  availableAssets: AssetOption[];
  onSelect: (asset: Asset) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function getAssetIssuer(asset: Asset): string | undefined {
  return 'issuer' in asset ? asset.issuer : undefined;
}

export function isSameAsset(a: Asset, b: Asset): boolean {
  if (a.type === 'native' && b.type === 'native') return true;
  if ('issuer' in a && 'issuer' in b) {
    return a.code === b.code && a.issuer === b.issuer;
  }
  return false;
}

export const AssetPicker: React.FC<AssetPickerProps> = ({
  selectedAsset,
  availableAssets,
  onSelect,
  disabled = false,
  label,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const pickerRef = React.useRef<HTMLDivElement>(null);

  const currentOption = availableAssets.find((opt) =>
    isSameAsset(opt.asset, selectedAsset),
  ) ?? {
    asset: selectedAsset,
    name: selectedAsset.code,
    symbol: selectedAsset.code,
  };

  const filtered = availableAssets.filter((opt) => {
    const issuer = getAssetIssuer(opt.asset);
    return (
      opt.symbol.toLowerCase().includes(search.toLowerCase()) ||
      opt.name.toLowerCase().includes(search.toLowerCase()) ||
      (issuer ? issuer.toLowerCase().includes(search.toLowerCase()) : false)
    );
  });

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={pickerRef} className={cn('relative w-full', className)}>
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium shadow-xs transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/80 cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {currentOption.symbol.slice(0, 3)}
          </div>
          <div className="truncate">
            <span className="block font-semibold text-slate-900 dark:text-slate-100">
              {currentOption.symbol}
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
              {currentOption.name}
            </span>
          </div>
        </div>

        <svg
          className={cn(
            'ml-2 h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400',
            isOpen && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Search filter */}
          <div className="px-1 pb-2">
            <input
              type="text"
              placeholder="Search asset or issuer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                No matching assets found
              </div>
            ) : (
              filtered.map((option) => {
                const isSelected = isSameAsset(option.asset, selectedAsset);
                const issuer = getAssetIssuer(option.asset);

                return (
                  <button
                    key={`${option.asset.code}-${issuer ?? 'native'}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(option.asset);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer',
                      isSelected &&
                        'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold dark:bg-slate-700 dark:text-slate-200">
                        {option.symbol.slice(0, 3)}
                      </div>
                      <div className="truncate">
                        <span className="block font-medium text-slate-900 dark:text-slate-100">
                          {option.symbol}
                        </span>
                        <span className="block text-slate-500 dark:text-slate-400 text-[10px] truncate">
                          {issuer
                            ? `${issuer.slice(0, 4)}...${issuer.slice(-4)}`
                            : 'Stellar Native'}
                        </span>
                      </div>
                    </div>

                    {option.balance !== undefined && (
                      <span className="ml-2 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        {option.balance}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
