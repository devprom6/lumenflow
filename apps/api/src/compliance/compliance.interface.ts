export type ComplianceAction = 'ALLOW' | 'FLAG' | 'BLOCK';

export interface ComplianceDecision {
  allowed: boolean;
  action: ComplianceAction;
  reason?: string | undefined;
  matchedList?: string | undefined;
}

export interface ComplianceCheckParams {
  userId: string;
  userAddress: string;
  amountUsd: number;
  destinationCurrency: string;
  destinationDetails?: Record<string, string> | undefined;
}

export interface ComplianceHook {
  readonly name: string;
  screenTransaction(params: ComplianceCheckParams): Promise<ComplianceDecision>;
}

export const COMPLIANCE_HOOK = Symbol('COMPLIANCE_HOOK');
