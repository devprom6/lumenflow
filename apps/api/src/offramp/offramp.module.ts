import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersModule } from '../orders/orders.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { ExchangeRatesService } from './exchange-rates.service';
import { TieredLimitsService } from './tiered-limits.service';
import { OfframpService } from './offramp.service';
import { OfframpController } from './offramp.controller';

@Module({
  imports: [DatabaseModule, OrdersModule, ComplianceModule],
  controllers: [OfframpController],
  providers: [TieredLimitsService, ExchangeRatesService, OfframpService],
  exports: [TieredLimitsService, ExchangeRatesService, OfframpService],
})
export class OfframpModule {}
