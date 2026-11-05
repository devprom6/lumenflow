'use client';

import { useState, useEffect, useCallback } from 'react';

interface AdminStats {
  ordersByStatus: Record<string, number>;
  ordersByType: Record<string, number>;
  totalOrders: number;
  failedCount: number;
}

function useAdminKey() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem('lumenflow-admin-key');
    if (stored) setAdminKey(stored);
  }, []);

  const login = () => {
    if (input.trim()) {
      sessionStorage.setItem('lumenflow-admin-key', input.trim());
      setAdminKey(input.trim());
    }
  };

  return { adminKey, input, setInput, login };
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ?? 'text-neutral-900'}`}>{value}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { adminKey, input, setInput, login } = useAdminKey();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  const fetchStats = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/stats`, {
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setStats(await res.json() as AdminStats);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [adminKey, apiUrl]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (!adminKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-md">
          <h1 className="mb-6 text-xl font-semibold text-neutral-900">Admin Access</h1>
          <label className="mb-1 block text-sm text-neutral-600" htmlFor="admin-key">
            Admin Key
          </label>
          <input
            id="admin-key"
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="Enter admin key"
            className="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
          />
          <button
            onClick={login}
            className="w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Access Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">LumenFlow Admin</h1>
          <nav className="flex gap-4 text-sm">
            <a href="/admin" className="font-medium text-neutral-900">Dashboard</a>
            <a href="/admin/orders" className="text-neutral-500 hover:text-neutral-900">Orders</a>
            <a href="/admin/bridge" className="text-neutral-500 hover:text-neutral-900">Bridge</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900">Overview</h2>
          <button
            onClick={() => void fetchStats()}
            disabled={loading}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* Top-level stats */}
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total Orders" value={stats.totalOrders} />
              <StatCard label="Completed" value={stats.ordersByStatus['COMPLETED'] ?? 0} accent="text-green-600" />
              <StatCard label="Processing" value={stats.ordersByStatus['PROCESSING'] ?? 0} accent="text-amber-600" />
              <StatCard label="Failed" value={stats.failedCount} accent="text-red-600" />
            </div>

            {/* By type + by status breakdown */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-medium text-neutral-700">Orders by Type</h3>
                {Object.entries(stats.ordersByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-neutral-600">{type}</span>
                    <span className="font-medium text-neutral-900">{count}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-medium text-neutral-700">Orders by Status</h3>
                {Object.entries(stats.ordersByStatus)
                  .filter(([, c]) => c > 0)
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-neutral-600">{status}</span>
                      <span className="font-medium text-neutral-900">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
