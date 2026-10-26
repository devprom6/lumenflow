import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelationIdMiddleware.name);

  use(
    req: Request & { correlationId?: string },
    res: Response,
    next: NextFunction,
  ): void {
    const correlationId =
      (req.headers['x-request-id'] as string) ?? crypto.randomUUID();

    req.correlationId = correlationId;
    res.setHeader('x-request-id', correlationId);

    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const logRecord = {
        timestamp: new Date().toISOString(),
        correlationId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip,
      };
      this.logger.log(JSON.stringify(logRecord));
    });

    next();
  }
}
