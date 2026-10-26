import { Module } from '@nestjs/common';
import { OrderStateMachineService } from './order-state-machine.service';
import { OrdersController } from './orders.controller';

@Module({
  controllers: [OrdersController],
  providers: [OrderStateMachineService],
  exports: [OrderStateMachineService],
})
export class OrdersModule {}
