import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  ChallengeRequestSchema,
  VerifyRequestSchema,
  type ChallengeRequestDto,
  type ChallengeResponseDto,
  type VerifyRequestDto,
  type VerifyResponseDto,
} from './dtos/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('challenge')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request SEP-10 wallet challenge',
    description:
      'Generates an unsigned challenge transaction for the wallet to sign.',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge transaction XDR and network passphrase returned.',
  })
  @ApiResponse({ status: 400, description: 'Invalid public key format.' })
  challenge(
    @Body(new ZodValidationPipe(ChallengeRequestSchema)) body: ChallengeRequestDto,
  ): ChallengeResponseDto {
    return this.authService.generateChallenge(body.publicKey);
  }

  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify signed SEP-10 challenge',
    description:
      'Verifies the wallet signature, upserts the user, and issues a session JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session JWT and authenticated user info returned.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid signature, expired challenge, or untrusted signer.',
  })
  async verify(
    @Body(new ZodValidationPipe(VerifyRequestSchema)) body: VerifyRequestDto,
  ): Promise<VerifyResponseDto> {
    return this.authService.verifyChallenge(body.transaction);
  }
}
