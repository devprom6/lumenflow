import crypto from 'node:crypto';
import type { AlertHook } from '../alerts/alert-hook.interface';

export interface InternalOrderRecord {
  id: string;
  type: string;
  status: string;
  sourceAmount: string;
  destinationAmount?: string | undefined;
  stellarTxHash?: string | undefined;
  externalId?: string | undefined;
  events: Array<{ fromStatus: string | null; toStatus: string }>;
}

export interface ExternalStatementRecord {
  id: string;
  externalId: string;
  provider: string;
  status: string;
  amount: string;
  settledOnChainTx?: string | undefined;
}

export interface ReconciliationMismatch {
  orderId?: string | undefined;
  externalId?: string | undefined;
  mismatchType:
    | 'STATUS_DISCREPANCY'
    | 'AMOUNT_MISMATCH'
    | 'MISSING_LEDGER_EVENTS'
    | 'UNMATCHED_EXTERNAL_RECORD';
  description: string;
  internalValue?: unknown;
  externalValue?: unknown;
}

export interface ReconciliationReport {
  id: string;
  runAt: string;
  ordersScanned: number;
  externalRecordsScanned: number;
  mismatchesCount: number;
  mismatches: ReconciliationMismatch[];
  status: 'CLEAN' | 'MISMATCHES_DETECTED';
}

export interface ReconciliationDataSource {
  getOrders(): Promise<InternalOrderRecord[]>;
  getExternalStatements(): Promise<ExternalStatementRecord[]>;
  saveReport(report: ReconciliationReport): Promise<void>;
}

export class ReconciliationService {
  private readonly reports: ReconciliationReport[] = [];

  constructor(
    private readonly dataSource: ReconciliationDataSource,
    private readonly alertHook: AlertHook,
  ) {}

  public getReports(): ReconciliationReport[] {
    return [...this.reports];
  }

  public getReport(id: string): ReconciliationReport | undefined {
    return this.reports.find((r) => r.id === id);
  }

  public async runReconciliation(): Promise<ReconciliationReport> {
    const orders = await this.dataSource.getOrders();
    const externalRecords = await this.dataSource.getExternalStatements();
    const mismatches: ReconciliationMismatch[] = [];

    const externalMap = new Map<string, ExternalStatementRecord>();
    for (const record of externalRecords) {
      externalMap.set(record.externalId, record);
    }

    for (const order of orders) {
      if (order.status === 'CREATED' || order.status === 'QUOTED') {
        continue;
      }

      // Check external statement if externalId exists
      if (order.externalId) {
        const ext = externalMap.get(order.externalId);
        if (ext) {
          // Status check
          if (order.status === 'COMPLETED' && ext.status !== 'COMPLETED' && ext.status !== 'SUCCESS') {
            mismatches.push({
              orderId: order.id,
              externalId: order.externalId,
              mismatchType: 'STATUS_DISCREPANCY',
              description: `Internal status is COMPLETED but external statement reports '${ext.status}'`,
              internalValue: order.status,
              externalValue: ext.status,
            });
          }

          // Amount check
          if (parseFloat(order.sourceAmount) !== parseFloat(ext.amount)) {
            mismatches.push({
              orderId: order.id,
              externalId: order.externalId,
              mismatchType: 'AMOUNT_MISMATCH',
              description: `Order amount ${order.sourceAmount} differs from external statement ${ext.amount}`,
              internalValue: order.sourceAmount,
              externalValue: ext.amount,
            });
          }
        }
      }

      // Check ledger event completeness
      if (order.status === 'COMPLETED') {
        const hasSubmitted = order.events.some((e) => e.toStatus === 'SUBMITTED');
        const hasProcessing = order.events.some((e) => e.toStatus === 'PROCESSING');
        if (!hasSubmitted || !hasProcessing) {
          mismatches.push({
            orderId: order.id,
            mismatchType: 'MISSING_LEDGER_EVENTS',
            description: `Completed order ${order.id} is missing expected intermediate ledger events (SUBMITTED/PROCESSING)`,
            internalValue: order.events.map((e) => e.toStatus),
          });
        }
      }
    }

    const report: ReconciliationReport = {
      id: `rec-${crypto.randomUUID()}`,
      runAt: new Date().toISOString(),
      ordersScanned: orders.length,
      externalRecordsScanned: externalRecords.length,
      mismatchesCount: mismatches.length,
      mismatches,
      status: mismatches.length === 0 ? 'CLEAN' : 'MISMATCHES_DETECTED',
    };

    this.reports.push(report);
    await this.dataSource.saveReport(report);

    if (mismatches.length > 0) {
      await this.alertHook.sendAlert({
        type: 'RECONCILIATION_MISMATCH',
        severity: 'CRITICAL',
        title: `Reconciliation detected ${mismatches.length} mismatch(es)`,
        details: {
          reportId: report.id,
          mismatchesCount: mismatches.length,
          sampleMismatch: mismatches[0],
        },
        timestamp: report.runAt,
      });
    }

    return report;
  }

  public async runWithSeededMismatch(): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      id: `rec-seeded-${Date.now()}`,
      runAt: new Date().toISOString(),
      ordersScanned: 10,
      externalRecordsScanned: 10,
      mismatchesCount: 1,
      mismatches: [
        {
          orderId: 'seeded-order-mismatch-1',
          externalId: 'br_seeded_statement_99',
          mismatchType: 'AMOUNT_MISMATCH',
          description: 'Seeded test mismatch: internal order amount (100.00 USDC) differs from on-chain provider statement (80.00 USDC)',
          internalValue: '100.00',
          externalValue: '80.00',
        },
      ],
      status: 'MISMATCHES_DETECTED',
    };

    this.reports.push(report);
    await this.dataSource.saveReport(report);

    await this.alertHook.sendAlert({
      type: 'RECONCILIATION_MISMATCH',
      severity: 'CRITICAL',
      title: 'Reconciliation detected 1 mismatch(es) (SEEDED TEST VERIFICATION)',
      details: {
        reportId: report.id,
        mismatch: report.mismatches[0],
      },
      timestamp: report.runAt,
    });

    return report;
  }
}
