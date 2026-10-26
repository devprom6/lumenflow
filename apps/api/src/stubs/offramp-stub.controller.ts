import {
  Controller,
  Get,
  Post,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Offramp (Stub)')
@Controller('offramp')
export class OfframpStubController {
  @Post('quote')
  @ApiOperation({ summary: 'Get offramp quote (Phase 2)' })
  @ApiResponse({ status: 501, description: 'Offramp corridors coming in Phase 2.' })
  getQuote(): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Crypto offramp quotes are scheduled for Phase 2.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create offramp order (Phase 2)' })
  @ApiResponse({ status: 501, description: 'Offramp orders coming in Phase 2.' })
  createOrder(): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Offramp order creation is scheduled for Phase 2.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get offramp order status (Phase 2)' })
  @ApiResponse({ status: 501, description: 'Offramp tracking coming in Phase 2.' })
  getStatus(@Param('id') _id: string): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Offramp order tracking is scheduled for Phase 2.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
