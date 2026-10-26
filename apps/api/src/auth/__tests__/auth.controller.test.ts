import { describe, it, expect } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../database/prisma.service';

describe('AuthController', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const prismaService = new PrismaService();
  const authService = new AuthService(jwtService, prismaService);
  const controller = new AuthController(authService);

  it('handles challenge and verify requests end-to-end', async () => {
    const client = Keypair.random();
    const challenge = controller.challenge({ publicKey: client.publicKey() });

    expect(challenge.transaction).toBeDefined();

    // Sign locally
    const { Transaction } = await import('@stellar/stellar-sdk');
    const tx = new Transaction(challenge.transaction, challenge.networkPassphrase);
    tx.sign(client);

    const verified = await controller.verify({ transaction: tx.toXDR() });
    expect(verified.token).toBeDefined();
    expect(verified.user.publicKey).toBe(client.publicKey());
  });
});
