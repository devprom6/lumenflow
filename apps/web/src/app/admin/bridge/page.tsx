'use client';

import { useState, useEffect, useCallback } from 'react';

interface ProviderStatus {
  name: string;
  healthy: boolean;
  killSwitchEnabled: boolean;
}

export default function AdminBridgePage() {
  const adminKey = typeof window !== 'undefined' ? sessionStorage.getItem('lumenflow-admin-key') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/bridge/providers`, {
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setProviders(await res.json() as ProviderStatus[]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [adminKey, apiUrl]);

  useEffect(() => { void fetchProviders(); }, [fetchProviders]);

  const toggleKillSwitch = async (name: string, currentKilled: boolean) => {
    setToggling(name);
    try {
      const res = await fetch(`${apiUrl}/admin/bridge/providers/${encodeURIComponent(name)}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ killed: !currentKilled }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const updated = await res.json() as ProviderStatus;
      setProviders((prev) => prev.map((p) => (p.name === name ? updated : p)));
    } catch (err) {
      setError(String(err));
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">LumenFlow Admin</h1>
          <nav className="flex gap-4 text-sm">
            <a href="/admin" className="text-neutral-500 hover:text-neutral-900">Dashboard</a>
            <a href="/admin/orders" className="text-neutral-500 hover:text-neutral-900">Orders</a>
            <a href="/admin/bridge" className="font-medium text-neutral-900">Bridge</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900">Bridge Providers</h2>
          <button
            onClick={() => void fetchProviders()}
            disabled={loading}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-3">
          {providers.map((provider) => (
            <div
              key={provider.name}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                {/* Health indicator */}
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${provider.healthy ? 'bg-green-500' : 'bg-red-500'}`}
                  title={provider.healthy ? 'Healthy' : 'Unhealthy'}
                />
                <div>
                  <p className="font-medium text-neutral-900">{provider.name}</p>
                  <p className="text-xs text-neutral-500">{provider.healthy ? 'Operational' : 'Degraded'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className={`text-sm ${provider.killSwitchEnabled ? 'text-red-600 font-medium' : 'text-neutral-400'}`}>
                  {provider.killSwitchEnabled ? '⛔ Killed' : 'Active'}
                </span>

                <button
                  onClick={() => void toggleKillSwitch(provider.name, provider.killSwitchEnabled)}
                  disabled={toggling === provider.name}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    provider.killSwitchEnabled
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {toggling === provider.name
                    ? 'Updating…'
                    : provider.killSwitchEnabled
                    ? 'Re-enable'
                    : 'Kill'}
                </button>
              </div>
            </div>
          ))}

          {providers.length === 0 && !loading && (
            <p className="py-8 text-center text-neutral-400">No bridge providers registered.</p>
          )}
        </div>

        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <strong>Warning:</strong> Killing a provider disables all new bridge transfers through it. In-flight transfers are not affected.
        </div>
      </main>
    </div>
  );
}
