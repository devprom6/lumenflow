import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

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
