import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('HealthController', () => {
  const prismaService = new PrismaService();
  const redisService = new RedisService();
  const healthService = new HealthService(prismaService, redisService);
  const controller = new HealthController(healthService);

  const mockResponse = {
    status: vi.fn(),
  } as unknown as Response;

  it('returns health check status with checks for postgres, redis, and stellar', async () => {
    const res = await controller.getHealth(mockResponse);

    expect(res).toBeDefined();
    expect(res.status).toMatch(/ok|degraded|down/);
    expect(res.checks.postgres).toBeDefined();
    expect(res.checks.redis).toBeDefined();
    expect(res.checks.stellar).toBeDefined();
    expect(res.uptime).toBeGreaterThanOrEqual(0);
  });
});
