import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorFilter } from '../filters/api-error.filter';

describe('ApiErrorFilter', () => {
  const filter = new ApiErrorFilter();

  it('formats HttpException into standard ApiError JSON response', () => {
    let capturedStatus = 0;
    let capturedJson: unknown = null;

    const mockResponse = {
      status: vi.fn((code: number) => {
        capturedStatus = code;
        return mockResponse;
      }),
      json: vi.fn((body: unknown) => {
        capturedJson = body;
        return mockResponse;
      }),
    } as unknown as Response;

    const mockRequest = {
      method: 'POST',
      url: '/swap/quote',
      headers: { 'x-request-id': 'req-test-123' },
    } as unknown as Request;

    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    const exception = new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid amount',
    });

    filter.catch(exception, host);

    expect(capturedStatus).toBe(400);
    expect(capturedJson).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid amount',
      statusCode: 400,
      requestId: 'req-test-123',
    });
  });
});
