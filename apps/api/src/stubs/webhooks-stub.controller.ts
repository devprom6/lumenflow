import { Controller, Post, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Webhooks (Stub)')
@Controller('webhooks')
export class WebhooksStubController {
  @Post('anchor')
  @ApiOperation({ summary: 'Anchor status callback' })
  @ApiResponse({ status: 501, description: 'Anchor webhook callback not implemented yet.' })
  anchorCallback(): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Anchor webhook callback is not implemented in MVP.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('bridge')
  @ApiOperation({ summary: 'Bridge status callback' })
  @ApiResponse({ status: 501, description: 'Bridge webhook callback not implemented yet.' })
  bridgeCallback(): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Bridge webhook callback is not implemented in MVP.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('payout')
  @ApiOperation({ summary: 'Payout status callback' })
  @ApiResponse({ status: 501, description: 'Payout webhook callback not implemented yet.' })
  payoutCallback(): never {
    throw new HttpException(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'Payout webhook callback is not implemented in MVP.',
        statusCode: HttpStatus.NOT_IMPLEMENTED,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
