import {
  Controller,
  Get,
  Post,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Bridge (Stub)')
@Controller('bridge')
export class BridgeStubController {
  @Post('quote')
  @ApiOperation({ summary: 'Get bridge route quote (Phase 2)' })
  @ApiResponse({ status: 501, description: 'Bridge routes coming in Phase 2.' })
  getQuote(): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message:
          'Cross-chain bridging is scheduled for Phase 2. BridgeAdapter mock providers will be integrated next.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Initiate bridge transfer (Phase 2)' })
  @ApiResponse({ status: 501, description: 'Bridge transfers coming in Phase 2.' })
  initiateTransfer(): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Bridge transfer initiation is scheduled for Phase 2.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Get('transfer/:id')
  @ApiOperation({ summary: 'Get bridge transfer status (Phase 2)' })
  @ApiResponse({ status: 501, description: 'Bridge transfer tracking coming in Phase 2.' })
  getStatus(@Param('id') _id: string): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Bridge transfer tracking is scheduled for Phase 2.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
