export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlertType =
  | 'STUCK_TRANSFER'
  | 'RECONCILIATION_MISMATCH'
  | 'CIRCUIT_BREAKER'
  | 'WEBHOOK_DLQ'
  | 'PAYOUT_DELAY';

export interface AlertPayload {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface AlertHook {
  sendAlert(alert: AlertPayload): Promise<void>;
}
