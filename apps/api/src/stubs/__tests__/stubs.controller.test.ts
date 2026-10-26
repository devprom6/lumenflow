import { describe, it, expect } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { BridgeStubController } from '../bridge-stub.controller';
import { OfframpStubController } from '../offramp-stub.controller';
import { WebhooksStubController } from '../webhooks-stub.controller';

describe('Stub Controllers', () => {
  const bridge = new BridgeStubController();
  const offramp = new OfframpStubController();
  const webhooks = new WebhooksStubController();

  it('bridge endpoints return 501 Not Implemented', () => {
    expect(() => bridge.getQuote()).toThrow(HttpException);
    expect(() => bridge.initiateTransfer()).toThrow(HttpException);
    expect(() => bridge.getStatus('123')).toThrow(HttpException);

    try {
      bridge.getQuote();
    } catch (err) {
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
    }
  });

  it('offramp endpoints return 501 Not Implemented', () => {
    expect(() => offramp.getQuote()).toThrow(HttpException);
    expect(() => offramp.createOrder()).toThrow(HttpException);
    expect(() => offramp.getStatus('123')).toThrow(HttpException);

    try {
      offramp.createOrder();
    } catch (err) {
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
    }
  });

  it('webhook endpoints return 501 Not Implemented', () => {
    expect(() => webhooks.anchorCallback()).toThrow(HttpException);
    expect(() => webhooks.bridgeCallback()).toThrow(HttpException);
    expect(() => webhooks.payoutCallback()).toThrow(HttpException);

    try {
      webhooks.anchorCallback();
    } catch (err) {
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
    }
  });
});
