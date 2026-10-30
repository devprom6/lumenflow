import { describe, it, expect, vi } from 'vitest';
import { AssetsService } from '../assets.service';
import type { RedisService } from '../../redis/redis.service';

describe('AssetsService', () => {
  it('returns default assets when Redis is not injected', async () => {
    const service = new AssetsService();
    const assets = await service.getSupportedAssets();

    expect(assets.length).toBeGreaterThanOrEqual(3);
    expect(assets.some((a) => a.symbol === 'XLM')).toBe(true);
    expect(assets.some((a) => a.symbol === 'USDC')).toBe(true);
  });

  it('reads from Redis cache when key exists', async () => {
    const mockCached = [
      {
        asset: { type: 'native', code: 'XLM' },
        name: 'Stellar Lumens Cached',
        symbol: 'XLM',
        decimals: 7,
      },
    ];

    const mockRedis: Partial<RedisService> = {
      get: vi.fn().mockResolvedValue(JSON.stringify(mockCached)),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AssetsService(mockRedis as RedisService);
    const result = await service.getSupportedAssets();

    expect(result).toEqual(mockCached);
    expect(mockRedis.get).toHaveBeenCalledWith('cache:assets:supported');
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('populates Redis cache on cache miss with 3600s TTL', async () => {
    const mockRedis: Partial<RedisService> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AssetsService(mockRedis as RedisService);
    const result = await service.getSupportedAssets();

    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(mockRedis.get).toHaveBeenCalledWith('cache:assets:supported');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'cache:assets:supported',
      JSON.stringify(result),
      3600,
    );
  });

  it('gracefully handles Redis exceptions on read and write', async () => {
    const mockRedis: Partial<RedisService> = {
      get: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
      set: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
    };

    const service = new AssetsService(mockRedis as RedisService);
    const result = await service.getSupportedAssets();

    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});
