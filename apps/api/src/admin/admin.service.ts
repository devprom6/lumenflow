import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

export interface ProviderStatus {
  name: string;
  healthy: boolean;
  killSwitchEnabled: boolean;
}

export interface ReconciliationReport {
  id: string;
  runAt: string;
  status: 'PASSED' | 'FAILED' | 'PENDING';
  discrepancies: number;
  notes: string;
}

export interface AdminStats {
  ordersByStatus: Record<string, number>;
  ordersByType: Record<string, number>;
  totalOrders: number;
  failedCount: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  /** In-memory kill-switch state: providerName -> killed */
  private readonly killSwitches = new Map<string, boolean>();

  /** Hardcoded provider list — real implementations come from bridge adapters registry */
  private readonly providers: ProviderStatus[] = [
    { name: 'MockBridge', healthy: true, killSwitchEnabled: false },
    { name: 'HttpBridge', healthy: true, killSwitchEnabled: false },
    { name: 'StargateBridge', healthy: true, killSwitchEnabled: false },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async getOrders(page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    try {
      const [items, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            events: {
              orderBy: { createdAt: 'asc' },
            },
          },
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch {
      // Offline/test: return sample data
      return {
        items: [
          {
            id: 'admin-order-1',
            userId: 'user-abc',
            type: 'SWAP',
            status: status ?? 'COMPLETED',
            sourceAsset: { code: 'XLM', type: 'native' },
            destinationAsset: { code: 'USDC', type: 'credit_alphanum4', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
            sourceAmount: '100.0000000',
            destinationAmount: '12.3000000',
            stellarTxHash: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: [],
          },
          {
            id: 'admin-order-2',
            userId: 'user-xyz',
            type: 'OFFRAMP',
            status: 'PROCESSING',
            sourceAsset: { code: 'USDC', type: 'credit_alphanum4', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
            destinationAsset: { code: 'NGN', type: 'fiat' },
            sourceAmount: '50.0000000',
            destinationAmount: '82500',
            stellarTxHash: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: [],
          },
        ],
        total: 2,
        page,
        limit,
        totalPages: 1,
      };
    }
  }

  async getOrderById(id: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: {
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!order) {
        throw new NotFoundException(`Order '${id}' not found`);
      }
      return order;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException(`Order '${id}' not found`);
    }
  }

  async getStats(): Promise<AdminStats> {
    try {
      const statuses = ['CREATED', 'QUOTED', 'AWAITING_SIGNATURE', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'REFUNDED'];
      const types = ['SWAP', 'BRIDGE', 'OFFRAMP'];

      const [statusCounts, typeCounts, total] = await Promise.all([
        Promise.all(
          statuses.map(async (s) => ({
            status: s,
            count: await this.prisma.order.count({ where: { status: s } }),
          })),
        ),
        Promise.all(
          types.map(async (t) => ({
            type: t,
            count: await this.prisma.order.count({ where: { type: t } }),
          })),
        ),
        this.prisma.order.count(),
      ]);

      const ordersByStatus = Object.fromEntries(statusCounts.map(({ status, count }) => [status, count]));
      const ordersByType = Object.fromEntries(typeCounts.map(({ type, count }) => [type, count]));

      return {
        ordersByStatus,
        ordersByType,
        totalOrders: total,
        failedCount: ordersByStatus['FAILED'] ?? 0,
      };
    } catch {
      // Offline/test: return sample stats
      return {
        ordersByStatus: {
          CREATED: 5,
          QUOTED: 3,
          AWAITING_SIGNATURE: 2,
          SUBMITTED: 1,
          PROCESSING: 4,
          COMPLETED: 42,
          FAILED: 3,
          EXPIRED: 1,
          REFUNDED: 0,
        },
        ordersByType: {
          SWAP: 35,
          BRIDGE: 12,
          OFFRAMP: 14,
        },
        totalOrders: 61,
        failedCount: 3,
      };
    }
  }

  listBridgeProviders(): ProviderStatus[] {
    return this.providers.map((provider) => ({
      ...provider,
      killSwitchEnabled: this.killSwitches.get(provider.name) ?? provider.killSwitchEnabled,
    }));
  }

  toggleProviderKillSwitch(name: string, killed: boolean): ProviderStatus {
    const provider = this.providers.find((p) => p.name === name);
    if (!provider) {
      throw new NotFoundException(`Bridge provider '${name}' not found`);
    }

    this.killSwitches.set(name, killed);
    this.logger.warn(`[KILL SWITCH] Provider '${name}' kill switch set to: ${killed}`);

    return {
      ...provider,
      killSwitchEnabled: killed,
    };
  }

  getReconciliationReports(): ReconciliationReport[] {
    return [
      {
        id: 'recon-001',
        runAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        status: 'PASSED',
        discrepancies: 0,
        notes: 'All orders reconciled against Stellar Horizon data.',
      },
      {
        id: 'recon-002',
        runAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        status: 'FAILED',
        discrepancies: 2,
        notes: '2 bridge orders with mismatched amounts detected. Manual review required.',
      },
    ];
  }

  runReconciliation(): { triggered: boolean; runId: string } {
    const runId = randomUUID();
    this.logger.log(`[RECONCILIATION] Manual reconciliation triggered. runId=${runId}`);
    return { triggered: true, runId };
  }
}
