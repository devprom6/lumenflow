'use client';

import { useState, useEffect, useCallback } from 'react';

interface OrderItem {
  id: string;
  type: string;
  status: string;
  sourceAmount: string;
  sourceAsset: Record<string, string>;
  destinationAsset: Record<string, string>;
  createdAt: string;
}

interface OrdersResult {
  items: OrderItem[];
  total: number;
  page: number;
  totalPages: number;
}

const STATUS_OPTIONS = ['', 'CREATED', 'QUOTED', 'AWAITING_SIGNATURE', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'REFUNDED'];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  AWAITING_SIGNATURE: 'bg-purple-100 text-purple-700',
  EXPIRED: 'bg-neutral-100 text-neutral-500',
  DEFAULT: 'bg-neutral-100 text-neutral-600',
};

export default function AdminOrdersPage() {
  const adminKey = typeof window !== 'undefined' ? sessionStorage.getItem('lumenflow-admin-key') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  const [result, setResult] = useState<OrdersResult | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      const res = await fetch(`${apiUrl}/admin/orders?${params.toString()}`, {
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setResult(await res.json() as OrdersResult);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [page, status, adminKey, apiUrl]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const statusClass = (s: string) => STATUS_COLORS[s] ?? STATUS_COLORS['DEFAULT'];

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">LumenFlow Admin</h1>
          <nav className="flex gap-4 text-sm">
            <a href="/admin" className="text-neutral-500 hover:text-neutral-900">Dashboard</a>
            <a href="/admin/orders" className="font-medium text-neutral-900">Orders</a>
            <a href="/admin/bridge" className="text-neutral-500 hover:text-neutral-900">Bridge</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <h2 className="text-xl font-semibold text-neutral-900">Orders</h2>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            onClick={() => void fetchOrders()}
            disabled={loading}
            className="ml-auto rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-100 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                {['ID', 'Type', 'Status', 'Source', 'Destination', 'Amount', 'Created'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {result?.items.map((order) => (
                <tr key={order.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">{order.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-neutral-700">{order.type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{(order.sourceAsset as { code?: string }).code ?? '-'}</td>
                  <td className="px-4 py-3 text-neutral-600">{(order.destinationAsset as { code?: string }).code ?? '-'}</td>
                  <td className="px-4 py-3 text-neutral-700">{order.sourceAmount}</td>
                  <td className="px-4 py-3 text-neutral-500">{new Date(order.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {result?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {result && result.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
            <span>
              Page {result.page} of {result.totalPages} ({result.total} orders)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-neutral-200 bg-white px-3 py-1 hover:bg-neutral-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= result.totalPages}
                className="rounded-md border border-neutral-200 bg-white px-3 py-1 hover:bg-neutral-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
