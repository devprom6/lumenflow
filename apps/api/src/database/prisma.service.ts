import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString =
      process.env['DATABASE_URL'] ??
      'postgresql://lumenflow:lumenflow_dev_password@localhost:5432/lumenflow_dev';
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL database');
    } catch (err) {
      this.logger.warn(
        `Database connection deferred (database offline or initializing): ${String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL database');
  }

  /**
   * Enforces that order_events is append-only by throwing on updates/deletes.
   */
  assertAppendOnlyOrderEventOperation(operation: string): void {
    const forbidden = ['update', 'updateMany', 'delete', 'deleteMany', 'upsert'];
    if (forbidden.includes(operation)) {
      throw new Error(
        `Forbidden operation '${operation}' on order_events: the table is append-only.`,
      );
    }
  }
}
