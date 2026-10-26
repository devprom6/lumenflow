import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AssetsModule } from './assets/assets.module';
import { SwapModule } from './swap/swap.module';
import { OrdersModule } from './orders/orders.module';
import { StubsModule } from './stubs/stubs.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AssetsModule,
    SwapModule,
    OrdersModule,
    StubsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
