import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UsePipes,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  OfframpQuoteRequestSchema,
  OfframpOrderRequestSchema,
  type OfframpQuoteRequest,
  type OfframpOrderRequest,
} from './dtos/offramp.dto';
import { OfframpService } from './offramp.service';

interface RequestWithUser {
  user?: {
    id?: string;
    sub?: string;
  };
}

@ApiTags('Offramp')
@Controller('offramp')
export class OfframpController {
  constructor(private readonly offrampService: OfframpService) {}

  @Post('quote')
  @UsePipes(new ZodValidationPipe(OfframpQuoteRequestSchema))
  @ApiOperation({ summary: 'Request offramp rate, fee breakdown, and rate-lock' })
  @ApiResponse({ status: 201, description: 'Guaranteed offramp quote' })
  @ApiResponse({ status: 400, description: 'Invalid amount or currency' })
  async getQuote(
    @Body() dto: OfframpQuoteRequest,
    @Request() req: RequestWithUser,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.offrampService.createQuote(dto, userId);
  }

  @Post('orders')
  @UsePipes(new ZodValidationPipe(OfframpOrderRequestSchema))
  @ApiOperation({ summary: 'Create offramp order and initiate interactive withdrawal' })
  @ApiResponse({ status: 201, description: 'Order created with interactive withdrawal window' })
  @ApiResponse({ status: 400, description: 'Quote expired or limits exceeded' })
  @ApiResponse({ status: 403, description: 'Blocked by compliance screening' })
  async createOrder(
    @Body() dto: OfframpOrderRequest,
    @Request() req: RequestWithUser,
  ) {
    const userId = req.user?.id ?? req.user?.sub ?? 'guest-user';
    return this.offrampService.createOrder(dto, userId);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get offramp order status' })
  @ApiResponse({ status: 200, description: 'Order status details' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getStatus(@Param('id') id: string) {
    return this.offrampService.getOrder(id);
  }
}
