'use client';

import * as React from 'react';
import type { Order } from '@lumenflow/shared-types';
import { Card, CardHeader, CardTitle, CardContent, StatusBadge, EmptyState } from '@lumenflow/ui';
import { useWalletStore } from '../../store/wallet-store';
import { ApiService } from '../../services/api';

export default function HistoryPage() {
  const { publicKey, jwtToken } = useWalletStore();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function fetchOrders() {
      setIsLoading(true);
      try {
        const data = await ApiService.getTransactions(publicKey, jwtToken);
        if (mounted) {
          setOrders(data);
        }
      } catch {
        if (mounted) {
          setOrders([]);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }
    void fetchOrders();
    return () => {
      mounted = false;
    };
  }, [publicKey, jwtToken]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Transaction History
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Audit trail of your non-custodial swaps on Stellar Testnet.
          </p>
        </div>
      </div>

      <Card className="border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent Swaps
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Loading transactions...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Transactions Found"
                description={
                  publicKey
                    ? "You haven't submitted any swaps with this wallet yet."
                    : 'Connect your wallet to view your swap history.'
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((order) => {
                const dateStr = new Date(order.createdAt).toLocaleString();
                const stellarTx = order.stellarTxHash;

                return (
                  <div
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {order.sourceAmount} {order.sourceAsset.code} →{' '}
                          {order.destinationAmount ?? '?'} {order.destinationAsset.code}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{dateStr}</span>
                        <span>•</span>
                        <span className="font-mono text-[11px]">
                          ID: {order.id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>

                    {stellarTx && (
                      <div className="flex items-center">
                        <a
                          href={`https://testnet.stellar.expert/explorer/testnet/tx/${stellarTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono font-medium text-blue-600 hover:text-blue-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
                        >
                          <span>Explorer ({stellarTx.slice(0, 6)}...)</span>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
