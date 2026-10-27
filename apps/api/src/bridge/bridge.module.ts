import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersModule } from '../orders/orders.module';
import { BridgeController } from './bridge.controller';
import { BridgeService } from './bridge.service';
import { BridgeSafeguardsService } from './bridge-safeguards.service';

@Module({
  imports: [DatabaseModule, OrdersModule],
  controllers: [BridgeController],
  providers: [BridgeService, BridgeSafeguardsService],
  exports: [BridgeService, BridgeSafeguardsService],
})
export class BridgeModule {}
