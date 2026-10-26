import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { RedisService } from '../../redis/redis.service';

export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface MemoryRecord {
  totalHits: number;
  expiresAt: number;
  blockedUntil: number;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memoryStore = new Map<string, MemoryRecord>();

  constructor(private readonly redisService?: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redis = this.redisService?.getClient();

    if (redis && this.redisService?.isAvailable()) {
      try {
        const redisKey = `throttle:${key}`;
        const blockKey = `throttle:block:${key}`;

        // Check if blocked
        const isBlocked = await redis.exists(blockKey);
        if (isBlocked) {
          const timeToBlockExpire = await redis.pttl(blockKey);
          return {
            totalHits: limit + 1,
            timeToExpire: Math.max(0, timeToBlockExpire),
            isBlocked: true,
            timeToBlockExpire: Math.max(0, timeToBlockExpire),
          };
        }

        const hits = await redis.incr(redisKey);
        if (hits === 1) {
          await redis.pexpire(redisKey, ttl);
        }

        const timeToExpire = await redis.pttl(redisKey);

        if (hits > limit && blockDuration > 0) {
          await redis.psetex(blockKey, blockDuration, 'blocked');
          return {
            totalHits: hits,
            timeToExpire: Math.max(0, timeToExpire),
            isBlocked: true,
            timeToBlockExpire: blockDuration,
          };
        }

        return {
          totalHits: hits,
          timeToExpire: Math.max(0, timeToExpire),
          isBlocked: false,
          timeToBlockExpire: 0,
        };
      } catch (err: unknown) {
        this.logger.debug(
          `Redis throttle error (${err instanceof Error ? err.message : String(err)}); falling back to memory`,
        );
      }
    }

    // In-memory fallback
    const now = Date.now();
    const existing = this.memoryStore.get(key);

    if (existing && existing.blockedUntil > now) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil((existing.blockedUntil - now) / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil((existing.blockedUntil - now) / 1000),
      };
    }

    if (!existing || existing.expiresAt <= now) {
      this.memoryStore.set(key, {
        totalHits: 1,
        expiresAt: now + ttl,
        blockedUntil: 0,
      });

      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    existing.totalHits += 1;
    const timeToExpire = Math.ceil(Math.max(0, existing.expiresAt - now) / 1000);

    if (existing.totalHits > limit && blockDuration > 0) {
      existing.blockedUntil = now + blockDuration;
      return {
        totalHits: existing.totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits: existing.totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
