import type {
  BridgeAdapter,
  BridgeQuote,
  BridgeRoute,
  QuoteParams,
} from '@lumenflow/shared-types';

export interface RegisteredAdapterEntry {
  adapter: BridgeAdapter;
  priority: number; // lower value = higher priority
  enabled: boolean;
}

export interface RouteLimits {
  minAmount?: string | undefined;
  maxAmount?: string | undefined;
}

export class BridgeAdapterRegistry {
  private readonly adapters: Map<string, RegisteredAdapterEntry> = new Map();
  private readonly providerKillSwitches: Map<string, boolean> = new Map();
  private readonly routeKillSwitches: Map<string, boolean> = new Map();
  private readonly routeLimits: Map<string, RouteLimits> = new Map();

  public register(adapter: BridgeAdapter, priority: number = 100, enabled: boolean = true): void {
    this.adapters.set(adapter.name, {
      adapter,
      priority,
      enabled,
    });
  }

  public unregister(name: string): boolean {
    return this.adapters.delete(name);
  }

  public getAdapter(name: string): BridgeAdapter | undefined {
    return this.adapters.get(name)?.adapter;
  }

  public listAdapters(): BridgeAdapter[] {
    return Array.from(this.adapters.values())
      .filter((e) => e.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map((e) => e.adapter);
  }

  public setProviderKillSwitch(providerName: string, killed: boolean): void {
    this.providerKillSwitches.set(providerName, killed);
  }

  public isProviderKilled(providerName: string): boolean {
    return this.providerKillSwitches.get(providerName) === true;
  }

  public setRouteKillSwitch(routeId: string, killed: boolean): void {
    this.routeKillSwitches.set(routeId, killed);
  }

  public isRouteKilled(routeId: string): boolean {
    return this.routeKillSwitches.get(routeId) === true;
  }

  public setRouteLimits(routeId: string, limits: RouteLimits): void {
    this.routeLimits.set(routeId, limits);
  }

  public getRouteLimits(routeId: string): RouteLimits | undefined {
    return this.routeLimits.get(routeId);
  }

  public async checkHealth(): Promise<Record<string, boolean>> {
    const healthMap: Record<string, boolean> = {};

    for (const [name, entry] of this.adapters.entries()) {
      if (!entry.enabled || this.isProviderKilled(name)) {
        healthMap[name] = false;
        continue;
      }

      if (entry.adapter.isHealthy) {
        try {
          healthMap[name] = await entry.adapter.isHealthy();
        } catch {
          healthMap[name] = false;
        }
      } else {
        healthMap[name] = true;
      }
    }

    return healthMap;
  }

  public async getHealthyAdapters(): Promise<BridgeAdapter[]> {
    const health = await this.checkHealth();
    return Array.from(this.adapters.values())
      .filter((entry) => entry.enabled && !this.isProviderKilled(entry.adapter.name) && health[entry.adapter.name] === true)
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.adapter);
  }

  public async getSupportedRoutes(): Promise<BridgeRoute[]> {
    const healthyAdapters = await this.getHealthyAdapters();
    const routeMap = new Map<string, BridgeRoute>();

    for (const adapter of healthyAdapters) {
      try {
        const routes = await adapter.getSupportedRoutes();
        for (const route of routes) {
          if (this.isRouteKilled(route.id)) {
            continue;
          }

          // Apply override limits if set
          const overrideLimits = this.routeLimits.get(route.id);
          const effectiveRoute: BridgeRoute = {
            ...route,
            minAmount: overrideLimits?.minAmount ?? route.minAmount,
            maxAmount: overrideLimits?.maxAmount ?? route.maxAmount,
          };

          if (!routeMap.has(route.id)) {
            routeMap.set(route.id, effectiveRoute);
          }
        }
      } catch {
        // Skip failed adapter route discovery
      }
    }

    return Array.from(routeMap.values());
  }

  public async getQuoteWithFallback(params: QuoteParams): Promise<{
    quote: BridgeQuote;
    adapterName: string;
  }> {
    const routeId = `${params.fromChain}-${params.toChain}-${params.fromAsset}`.toLowerCase();
    if (this.isRouteKilled(routeId)) {
      throw new Error(`Route ${params.fromChain}->${params.toChain} is currently disabled by safeguard kill switch`);
    }

    const healthyAdapters = await this.getHealthyAdapters();
    if (healthyAdapters.length === 0) {
      throw new Error('No healthy bridge providers available');
    }

    const errors: string[] = [];

    for (const adapter of healthyAdapters) {
      try {
        const quote = await adapter.getQuote(params);
        return {
          quote,
          adapterName: adapter.name,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${adapter.name}: ${msg}`);
      }
    }

    throw new Error(
      `All bridge providers failed for route ${params.fromChain}->${params.toChain}. Attempts: [${errors.join('; ')}]`,
    );
  }
}
