import { Injectable, Logger } from '@nestjs/common';
import {
  type ComplianceHook,
  type ComplianceCheckParams,
  type ComplianceDecision,
  type ComplianceAction,
} from './compliance.interface';

@Injectable()
export class MockComplianceHookService implements ComplianceHook {
  readonly name = 'MockComplianceHook';
  private readonly logger = new Logger(MockComplianceHookService.name);

  private readonly blockedAddresses = new Set<string>([
    'GBBLOCKEDSANCTIONEDADDRESSFORTESTINGPURPOSES000000000001',
    'GSANCTIONEDTESTNETADDRESSDOESNOTPASSCOMPLIANCE0000000001',
  ]);

  private readonly flaggedAddresses = new Set<string>([
    'GFLAGGEDMONITORINGTESTNETADDRESSFORAUDITTRAIL0000000001',
  ]);

  private defaultAction: ComplianceAction = 'ALLOW';

  setDefaultAction(action: ComplianceAction): void {
    this.defaultAction = action;
  }

  addBlockedAddress(address: string): void {
    this.blockedAddresses.add(address);
  }

  addFlaggedAddress(address: string): void {
    this.flaggedAddresses.add(address);
  }

  clear(): void {
    this.blockedAddresses.clear();
    this.flaggedAddresses.clear();
    this.defaultAction = 'ALLOW';
  }

  async screenTransaction(
    params: ComplianceCheckParams,
  ): Promise<ComplianceDecision> {
    await Promise.resolve();
    if (this.defaultAction === 'BLOCK') {
      return {
        allowed: false,
        action: 'BLOCK',
        reason: 'Compliance policy enforcement: high-risk transaction blocked',
      };
    }

    if (this.blockedAddresses.has(params.userAddress)) {
      this.logger.warn(
        `Blocked transaction for user ${params.userId} (${params.userAddress}): matched OFAC sanctions list`,
      );
      return {
        allowed: false,
        action: 'BLOCK',
        reason: 'Address matched on global sanctions screening list',
        matchedList: 'OFAC_SDN_MOCK',
      };
    }

    if (this.flaggedAddresses.has(params.userAddress)) {
      this.logger.log(
        `Flagged transaction for user ${params.userId} (${params.userAddress}): suspicious volume alert`,
      );
      return {
        allowed: true,
        action: 'FLAG',
        reason: 'Address flagged for secondary AML transaction monitoring',
        matchedList: 'WATCHLIST_MOCK',
      };
    }

    return {
      allowed: true,
      action: 'ALLOW',
    };
  }
}
