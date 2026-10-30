import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BridgeService } from './bridge.service';
import { BridgeSafeguardsService } from './bridge-safeguards.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import {
  BridgeQuoteRequestDto,
  BridgeTransferRequestDto,
  KillSwitchToggleDto,
  RouteLimitConfigDto,
  type BridgeQuoteRequest,
  type BridgeTransferRequest,
  type KillSwitchToggle,
  type RouteLimitConfig,
} from './dtos/bridge.dto';

@ApiTags('Bridge')
@Controller('bridge')
export class BridgeController {
  constructor(
    private readonly bridgeService: BridgeService,
    private readonly safeguards: BridgeSafeguardsService,
  ) {}

  @Get('routes')
  @ApiOperation({ summary: 'Get list of supported cross-chain routes' })
  @ApiResponse({ status: 200, description: 'Supported bridge routes' })
  async getRoutes() {
    return this.bridgeService.getSupportedRoutes();
  }

  @Post('quote')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(BridgeQuoteRequestDto))
  @ApiOperation({ summary: 'Request cross-chain bridge quote with fee estimate' })
  @ApiResponse({ status: 200, description: 'Bridge quote generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid route, amount below min or above max' })
  @ApiResponse({ status: 403, description: 'Route paused by safeguard kill-switch' })
  async getQuote(@Body() body: BridgeQuoteRequest) {
    return this.bridgeService.getQuote(body);
  }

  @Post('transfer')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(BridgeTransferRequestDto))
  @ApiOperation({ summary: 'Initiate bridge transfer and construct unsigned transaction' })
  @ApiResponse({ status: 201, description: 'Unsigned transfer created for local wallet signing' })
  @ApiResponse({ status: 400, description: 'Quote expired or invalid' })
  @ApiResponse({ status: 403, description: 'Safeguard triggered' })
  async initiateTransfer(@Body() body: BridgeTransferRequest) {
    return this.bridgeService.initiateTransfer(body);
  }

  @Get('transfer/:id')
  @ApiOperation({ summary: 'Get bridge transfer and on-chain progress status' })
  @ApiResponse({ status: 200, description: 'Bridge transfer status details' })
  @ApiResponse({ status: 404, description: 'Transfer or order not found' })
  async getTransfer(@Param('id') id: string) {
    return this.bridgeService.getTransferStatus(id);
  }

  @Post('safeguards/kill-switch')
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(KillSwitchToggleDto))
  @ApiOperation({ summary: 'Toggle route or provider kill switch (Admin only)' })
  @ApiHeader({ name: 'x-admin-key', description: 'Admin API Key for safeguard controls' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Safeguard updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized admin credentials' })
  toggleKillSwitch(@Body() body: KillSwitchToggle) {
    if (body.type === 'route') {
      this.safeguards.setRouteKillSwitch(body.target, body.killed);
    } else {
      this.safeguards.setProviderKillSwitch(body.target, body.killed);
    }
    return {
      success: true,
      target: body.target,
      type: body.type,
      killed: body.killed,
    };
  }

  @Post('safeguards/limits')
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(RouteLimitConfigDto))
  @ApiOperation({ summary: 'Configure per-route min and max transfer limits (Admin only)' })
  @ApiHeader({ name: 'x-admin-key', description: 'Admin API Key for safeguard controls' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Route limits updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized admin credentials' })
  configureLimits(@Body() body: RouteLimitConfig) {
    this.safeguards.setRouteLimit(body.routeId, {
      minAmount: body.minAmount,
      maxAmount: body.maxAmount,
    });
    return {
      success: true,
      routeId: body.routeId,
      limits: {
        minAmount: body.minAmount,
        maxAmount: body.maxAmount,
      },
    };
  }
}
