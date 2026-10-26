import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SwapService } from './swap.service';
import type { Quote } from '@lumenflow/shared-types';
import type {
  CreateSwapQuoteRequestDto,
  BuildSwapRequestDto,
  BuildSwapResponseDto,
  SubmitSwapRequestDto,
  SubmitSwapResponseDto,
} from './dtos/swap.dto';

@ApiTags('Swap')
@Controller('swap')
export class SwapController {
  constructor(private readonly swapService: SwapService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a swap quote',
    description:
      'Calculates the best route across order-book DEX and liquidity pools with fee breakdown and expiry.',
  })
  @ApiResponse({ status: 200, description: 'Live swap quote returned.' })
  @ApiResponse({ status: 400, description: 'Invalid asset or amount parameter.' })
  async getQuote(@Body() body: CreateSwapQuoteRequestDto): Promise<Quote> {
    return this.swapService.createQuote(body);
  }

  @Post('build')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Build an unsigned swap transaction',
    description:
      'Generates an unsigned Stellar transaction XDR (including changeTrust if needed). Non-custodial: user signs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unsigned transaction XDR ready for wallet signing.',
  })
  @ApiResponse({
    status: 400,
    description: 'Quote expired or insufficient reserves.',
  })
  async build(@Body() body: BuildSwapRequestDto): Promise<BuildSwapResponseDto> {
    return this.swapService.buildSwap(body);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit signed swap transaction',
    description:
      'Submits a user-signed transaction to Stellar Testnet and updates order state ledger.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction submitted and confirmed on ledger.',
  })
  @ApiResponse({
    status: 400,
    description: 'Transaction failed or invalid signature.',
  })
  async submit(
    @Body() body: SubmitSwapRequestDto,
  ): Promise<SubmitSwapResponseDto> {
    return this.swapService.submitSwap(body);
  }
}
