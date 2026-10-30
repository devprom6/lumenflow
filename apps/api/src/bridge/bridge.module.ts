import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersModule } from '../orders/orders.module';
import { BridgeController } from './bridge.controller';
import { BridgeService } from './bridge.service';
import { BridgeSafeguardsService } from './bridge-safeguards.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';

@Module({
  imports: [DatabaseModule, OrdersModule],
  controllers: [BridgeController],
  providers: [BridgeService, BridgeSafeguardsService, AdminAuthGuard],
  exports: [BridgeService, BridgeSafeguardsService, AdminAuthGuard],
})
export class BridgeModule {}
