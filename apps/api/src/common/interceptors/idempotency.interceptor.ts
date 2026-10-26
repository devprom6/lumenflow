import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';

interface CachedResponse {
  status: 'in_progress' | 'completed';
  statusCode: number;
  body: unknown;
  timestamp: number;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly memoryStore = new Map<string, CachedResponse>();
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(@Optional() private readonly redisService?: RedisService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Only apply to POST requests
    if (req.method !== 'POST') {
      return next.handle();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return next.handle();
    }

    const redis = this.redisService?.getClient();
    const redisKey = `idempotency:${idempotencyKey}`;

    if (redis && this.redisService?.isAvailable()) {
      try {
        const cachedRaw = await redis.get(redisKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as CachedResponse;
          if (cached.status === 'in_progress') {
            throw new ConflictException({
              code: 'IDEMPOTENCY_CONFLICT',
              message:
                'A request with this Idempotency-Key is already currently being processed.',
              statusCode: 409,
            });
          }

          res.setHeader('X-Idempotent-Replay', 'true');
          res.status(cached.statusCode);
          return of(cached.body);
        }

        // Lock with in_progress
        const lockValue: CachedResponse = {
          status: 'in_progress',
          statusCode: 200,
          body: null,
          timestamp: Date.now(),
        };
        await redis.set(redisKey, JSON.stringify(lockValue), 'EX', this.TTL_SECONDS);

        return next.handle().pipe(
          tap({
            next: (body: unknown) => {
              const completedValue: CachedResponse = {
                status: 'completed',
                statusCode: res.statusCode,
                body,
                timestamp: Date.now(),
              };
              void redis.set(
                redisKey,
                JSON.stringify(completedValue),
                'EX',
                this.TTL_SECONDS,
              );
            },
            error: () => {
              void redis.del(redisKey);
            },
          }),
        );
      } catch (err: unknown) {
        if (err instanceof ConflictException) {
          throw err;
        }
        this.logger.debug(
          `Redis error in IdempotencyInterceptor (${err instanceof Error ? err.message : String(err)}); using memory store`,
        );
      }
    }

    // In-memory fallback
    const cached = this.memoryStore.get(idempotencyKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.TTL_SECONDS * 1000) {
      if (cached.status === 'in_progress') {
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message:
            'A request with this Idempotency-Key is already currently being processed.',
          statusCode: 409,
        });
      }

      res.setHeader('X-Idempotent-Replay', 'true');
      res.status(cached.statusCode);
      return of(cached.body);
    }

    this.memoryStore.set(idempotencyKey, {
      status: 'in_progress',
      statusCode: 200,
      body: null,
      timestamp: now,
    });

    return next.handle().pipe(
      tap({
        next: (body: unknown) => {
          this.memoryStore.set(idempotencyKey, {
            status: 'completed',
            statusCode: res.statusCode,
            body,
            timestamp: Date.now(),
          });
        },
        error: () => {
          this.memoryStore.delete(idempotencyKey);
        },
      }),
    );
  }
}
