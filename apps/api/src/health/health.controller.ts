import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService, HealthCheckResult } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'System health check',
    description:
      'Checks connectivity to PostgreSQL database, Redis instance, and Stellar Horizon Testnet.',
  })
  @ApiResponse({
    status: 200,
    description: 'System is healthy or running with fallbacks.',
  })
  @ApiResponse({
    status: 503,
    description: 'Core system component is down.',
  })
  async getHealth(@Res({ passthrough: true }) res: Response): Promise<HealthCheckResult> {
    const result = await this.healthService.check();

    if (result.status === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
