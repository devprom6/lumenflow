import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@lumenflow/shared-types';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const requestId =
      request.correlationId ??
      (request.headers['x-request-id'] as string) ??
      'unknown-request-id';

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected internal error occurred.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj['message'] as string) ?? exception.message;
        code = (resObj['code'] as string) ?? code;
        if (resObj['details']) {
          details = resObj['details'] as Record<string, unknown>;
        }
      }

      if (statusCode === 400 && code === 'INTERNAL_ERROR') {
        code = 'VALIDATION_ERROR';
      } else if (statusCode === 401 && code === 'INTERNAL_ERROR') {
        code = 'UNAUTHORIZED';
      } else if (statusCode === 404 && code === 'INTERNAL_ERROR') {
        code = 'NOT_FOUND';
      } else if (statusCode === 501 && code === 'INTERNAL_ERROR') {
        code = 'NOT_IMPLEMENTED';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    }

    const errorPayload: ApiError = {
      code,
      message,
      statusCode,
      requestId,
      ...(details ? { details } : {}),
    };

    // Structured JSON log for observability
    this.logger.warn(
      JSON.stringify({
        level: statusCode >= 500 ? 'ERROR' : 'WARN',
        timestamp: new Date().toISOString(),
        requestId,
        method: request.method,
        url: request.url,
        statusCode,
        code,
        message,
      }),
    );

    response.status(statusCode).json(errorPayload);
  }
}
