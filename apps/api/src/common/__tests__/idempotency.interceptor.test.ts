import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, CallHandler, ConflictException } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import type { Request, Response } from 'express';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  const interceptor = new IdempotencyInterceptor();

  function mockContext(method: string, headers: Record<string, string>): {
    context: ExecutionContext;
    res: Response;
    setHeaderSpy: ReturnType<typeof vi.fn>;
  } {
    const resHeaders: Record<string, string> = {};
    const setHeaderSpy = vi.fn((k: string, v: string) => {
      resHeaders[k.toLowerCase()] = v;
    });

    const res = {
      statusCode: 200,
      setHeader: setHeaderSpy,
      status: vi.fn(),
    } as unknown as Response;

    const req = {
      method,
      headers,
    } as unknown as Request;

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    return { context, res, setHeaderSpy };
  }

  it('passes through non-POST requests', async () => {
    const { context } = mockContext('GET', {});
    const handler: CallHandler = { handle: () => of({ data: 'ok' }) };

    const result = await interceptor.intercept(context, handler);
    const value = await firstValueFrom(result);
    expect(value).toEqual({ data: 'ok' });
  });

  it('caches and replays POST response with same Idempotency-Key', async () => {
    const key = 'idem-test-key-1';
    const { context: ctx1 } = mockContext('POST', { 'idempotency-key': key });
    const handler1: CallHandler = { handle: () => of({ quoteId: 'q-100' }) };

    // First request executes
    const res1$ = await interceptor.intercept(ctx1, handler1);
    const val1 = await firstValueFrom(res1$);
    expect(val1).toEqual({ quoteId: 'q-100' });

    // Second request with same key replays without invoking handler
    const { context: ctx2, setHeaderSpy } = mockContext('POST', {
      'idempotency-key': key,
    });
    const handleSpy = vi.fn(() => of({ quoteId: 'q-200' }));
    const handler2: CallHandler = {
      handle: handleSpy,
    };

    const res2$ = await interceptor.intercept(ctx2, handler2);
    const val2 = await firstValueFrom(res2$);

    expect(val2).toEqual({ quoteId: 'q-100' });
    expect(handleSpy).not.toHaveBeenCalled();
    expect(setHeaderSpy).toHaveBeenCalledWith('X-Idempotent-Replay', 'true');
  });

  it('throws ConflictException when duplicate request arrives while in-progress', async () => {
    const key = 'idem-in-progress-key';
    const { context: ctx1 } = mockContext('POST', { 'idempotency-key': key });

    // Simulate an ongoing execution
    const interceptPromise = interceptor.intercept(ctx1, {
      handle: () => of({ test: 1 }),
    });

    // Before observable is consumed, intercept a second request
    const { context: ctx2 } = mockContext('POST', { 'idempotency-key': key });
    await expect(
      interceptor.intercept(ctx2, { handle: () => of({ test: 2 }) }),
    ).rejects.toThrow(ConflictException);

    // Consume first observable to clean up
    const res1 = await interceptPromise;
    await firstValueFrom(res1);
  });
});
