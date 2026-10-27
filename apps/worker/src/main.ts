import { LumenFlowWorkerService } from './worker';

async function bootstrap() {
  const dummyUpdater = {
    getOrder: () => Promise.resolve(null),
    transitionOrder: () => Promise.resolve(),
  };

  const dummyDispatcher = {
    dispatch: () => Promise.resolve(true),
  };

  const dummyExpiryStore = {
    getPendingOrders: () => Promise.resolve([]),
    getPendingQuotes: () => Promise.resolve([]),
    markQuoteExpired: () => Promise.resolve(),
  };

  const dummyReconciliationSource = {
    getOrders: () => Promise.resolve([]),
    getExternalStatements: () => Promise.resolve([]),
    saveReport: () => Promise.resolve(),
  };

  const service = new LumenFlowWorkerService(
    dummyUpdater,
    dummyDispatcher,
    dummyExpiryStore,
    dummyReconciliationSource,
  );

  await service.start();
}

void bootstrap();
