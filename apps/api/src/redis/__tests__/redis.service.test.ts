import { describe, it, expect } from 'vitest';
import { RedisService } from '../redis.service';
import { RedisThrottlerStorage } from '../../common/throttler/redis-throttler-storage';

describe('RedisService and RedisThrottlerStorage', () => {
  it('handles in-memory rate limiting when Redis is not connected', async () => {
    const redisService = new RedisService();
    const storage = new RedisThrottlerStorage(redisService);

    // 1st hit
    const res1 = await storage.increment('user-ip-123', 60000, 2, 0, 'default');
    expect(res1.totalHits).toBe(1);
    expect(res1.isBlocked).toBe(false);

    // 2nd hit
    const res2 = await storage.increment('user-ip-123', 60000, 2, 0, 'default');
    expect(res2.totalHits).toBe(2);
    expect(res2.isBlocked).toBe(false);

    // 3rd hit (exceeds limit 2)
    const res3 = await storage.increment('user-ip-123', 60000, 2, 1000, 'default');
    expect(res3.totalHits).toBe(3);
    expect(res3.isBlocked).toBe(true);
  });

  it('reports healthy status with fallback', async () => {
    const redisService = new RedisService();
    const status = await redisService.isHealthy();
    expect(status.status).toBe('down');
  });
});
