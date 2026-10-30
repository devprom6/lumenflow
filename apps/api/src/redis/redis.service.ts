import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

interface CacheEntry {
  value: string;
  expiresAt?: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  private readonly fallbackCache = new Map<string, CacheEntry>();

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });

      this.client.on('error', (err) => {
        this.logger.debug(`Redis connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connected successfully');
        this.isConnected = true;
      });

      await this.client.connect().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Redis unavailable (${message}); falling back to in-memory state`);
        this.isConnected = false;
      });
    } catch (err: unknown) {
      this.logger.warn(`Failed to initialize Redis client: ${String(err)}`);
      this.isConnected = false;
    }
  }

  getClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }

  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  async isHealthy(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
    if (!this.client || !this.isConnected) {
      return { status: 'down', error: 'Redis client not connected' };
    }

    const start = Date.now();
    try {
      const pong = await this.client.ping();
      const latencyMs = Date.now() - start;
      if (pong === 'PONG') {
        return { status: 'up', latencyMs };
      }
      return { status: 'down', latencyMs, error: `Unexpected response: ${pong}` };
    } catch (err: unknown) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Retrieves a string or JSON cached value from Redis or fallback memory.
   */
  async get(key: string): Promise<string | null> {
    if (this.isAvailable() && this.client) {
      try {
        return await this.client.get(key);
      } catch (err) {
        this.logger.debug(`Redis get failed for ${key}: ${String(err)}`);
      }
    }

    // In-memory fallback
    const entry = this.fallbackCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.fallbackCache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Sets a value in Redis with optional TTL in seconds.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isAvailable() && this.client) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch (err) {
        this.logger.debug(`Redis set failed for ${key}: ${String(err)}`);
      }
    }

    // In-memory fallback
    const entry: CacheEntry = { value };
    if (ttlSeconds && ttlSeconds > 0) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
    this.fallbackCache.set(key, entry);
  }

  /**
   * Deletes a cached key.
   */
  async del(key: string): Promise<void> {
    if (this.isAvailable() && this.client) {
      try {
        await this.client.del(key);
      } catch (err) {
        this.logger.debug(`Redis del failed for ${key}: ${String(err)}`);
      }
    }
    this.fallbackCache.delete(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }
}
