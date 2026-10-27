import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { RouteLimits } from '@lumenflow/bridge-adapters';

@Injectable()
export class BridgeSafeguardsService {
  private readonly logger = new Logger(BridgeSafeguardsService.name);
  private readonly routeKillSwitches = new Map<string, boolean>();
  private readonly providerKillSwitches = new Map<string, boolean>();
  private readonly routeLimits = new Map<string, RouteLimits>();

  constructor() {
    // Default operational parameters
    this.logger.log('BridgeSafeguardsService initialized with dynamic safeguard controls');
  }

  public setRouteKillSwitch(routeId: string, killed: boolean): void {
    const key = routeId.toLowerCase();
    this.routeKillSwitches.set(key, killed);
    this.logger.warn(`Safeguard updated: Route '${key}' kill-switch set to ${killed}`);
  }

  public isRouteKilled(routeId: string): boolean {
    return this.routeKillSwitches.get(routeId.toLowerCase()) === true;
  }

  public setProviderKillSwitch(providerName: string, killed: boolean): void {
    const key = providerName.toLowerCase();
    this.providerKillSwitches.set(key, killed);
    this.logger.warn(`Safeguard updated: Provider '${key}' kill-switch set to ${killed}`);
  }

  public isProviderKilled(providerName: string): boolean {
    return this.providerKillSwitches.get(providerName.toLowerCase()) === true;
  }

  public setRouteLimit(routeId: string, limits: RouteLimits): void {
    const key = routeId.toLowerCase();
    this.routeLimits.set(key, limits);
    this.logger.log(`Safeguard updated: Route '${key}' limits configured: min=${limits.minAmount ?? 'default'}, max=${limits.maxAmount ?? 'default'}`);
  }

  public getRouteLimit(routeId: string): RouteLimits | undefined {
    return this.routeLimits.get(routeId.toLowerCase());
  }

  public assertSafeguards(routeId: string, providerName: string, amountStr: string): void {
    const routeKey = routeId.toLowerCase();
    const providerKey = providerName.toLowerCase();

    if (this.isRouteKilled(routeKey)) {
      throw new ForbiddenException({
        code: 'ROUTE_DISABLED',
        message: `Cross-chain route '${routeId}' has been paused by safeguard kill-switch.`,
      });
    }

    if (this.isProviderKilled(providerKey)) {
      throw new ForbiddenException({
        code: 'PROVIDER_DISABLED',
        message: `Bridge provider '${providerName}' has been temporarily halted by safeguard kill-switch.`,
      });
    }

    const limits = this.getRouteLimit(routeKey);
    if (limits) {
      const amount = parseFloat(amountStr);
      if (limits.minAmount !== undefined && limits.minAmount !== null) {
        const min = parseFloat(limits.minAmount);
        if (amount < min) {
          throw new BadRequestException({
            code: 'AMOUNT_BELOW_MINIMUM',
            message: `Transfer amount (${amount}) is below configured safeguard minimum (${min}) for route '${routeId}'.`,
          });
        }
      }
      if (limits.maxAmount !== undefined && limits.maxAmount !== null) {
        const max = parseFloat(limits.maxAmount);
        if (amount > max) {
          throw new BadRequestException({
            code: 'AMOUNT_EXCEEDS_MAXIMUM',
            message: `Transfer amount (${amount}) exceeds configured safeguard maximum (${max}) for route '${routeId}'.`,
          });
        }
      }
    }
  }
}
