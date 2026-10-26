import { Module } from '@nestjs/common';
import { BridgeStubController } from './bridge-stub.controller';
import { OfframpStubController } from './offramp-stub.controller';
import { WebhooksStubController } from './webhooks-stub.controller';

@Module({
  controllers: [
    BridgeStubController,
    OfframpStubController,
    WebhooksStubController,
  ],
})
export class StubsModule {}
