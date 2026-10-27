import { Module } from '@nestjs/common';
import { BridgeStubController } from './bridge-stub.controller';

@Module({
  controllers: [BridgeStubController],
})
export class StubsModule {}
