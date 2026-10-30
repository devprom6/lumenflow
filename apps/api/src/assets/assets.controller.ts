import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AssetsService, SupportedAssetInfo } from './assets.service';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @ApiOperation({
    summary: 'List supported assets',
    description: 'Returns all Stellar testnet assets supported by LumenFlow.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of supported assets with issuer and metadata.',
  })
  async getAssets(): Promise<SupportedAssetInfo[]> {
    return this.assetsService.getSupportedAssets();
  }
}
