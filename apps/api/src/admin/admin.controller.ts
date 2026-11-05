import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminAuthGuard } from '../bridge/guards/admin-auth.guard';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Aggregated order stats' })
  async getStats() {
    return this.admin.getStats();
  }

  @Get('orders')
  @ApiOperation({ summary: 'List all orders with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async getOrders(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.admin.getOrders(Number(page), Number(limit), status);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get single order with event history' })
  async getOrderById(@Param('id') id: string) {
    return this.admin.getOrderById(id);
  }

  @Get('bridge/providers')
  @ApiOperation({ summary: 'List registered bridge providers and health status' })
  listBridgeProviders() {
    return this.admin.listBridgeProviders();
  }

  @Post('bridge/providers/:name/kill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle kill switch for a bridge provider' })
  toggleProviderKillSwitch(
    @Param('name') name: string,
    @Body() body: { killed: boolean },
  ) {
    return this.admin.toggleProviderKillSwitch(name, body.killed);
  }

  @Get('reconciliation/reports')
  @ApiOperation({ summary: 'List recent reconciliation reports' })
  getReconciliationReports() {
    return this.admin.getReconciliationReports();
  }

  @Post('reconciliation/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger a reconciliation run manually' })
  runReconciliation() {
    return this.admin.runReconciliation();
  }
}
