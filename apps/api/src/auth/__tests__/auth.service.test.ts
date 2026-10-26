import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Keypair, Transaction, Networks, TransactionBuilder, Account, Operation } from '@stellar/stellar-sdk';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../database/prisma.service';

describe('AuthService', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let prismaService: PrismaService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret' });
    prismaService = new PrismaService();
    authService = new AuthService(jwtService, prismaService);
  });

  describe('generateChallenge', () => {
    it('generates a valid challenge transaction for a valid public key', () => {
      const client = Keypair.random();
      const result = authService.generateChallenge(client.publicKey());

      expect(result.transaction).toBeDefined();
      expect(result.networkPassphrase).toBe(Networks.TESTNET);

      const tx = new Transaction(result.transaction, result.networkPassphrase);
      expect(tx.source).toBe(authService.getServerPublicKey());
      expect(tx.sequence).toBe('0');
      expect(tx.operations).toHaveLength(1);

      const op = tx.operations[0];
      expect(op?.type).toBe('manageData');
      expect(op?.source).toBe(client.publicKey());
    });

    it('throws BadRequestException for an invalid Stellar public key', () => {
      expect(() => authService.generateChallenge('invalid-key')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyChallenge', () => {
    it('verifies a properly signed challenge and returns token and user', async () => {
      const client = Keypair.random();
      const challenge = authService.generateChallenge(client.publicKey());

      // Client signs the challenge
      const clientTx = new Transaction(challenge.transaction, challenge.networkPassphrase);
      clientTx.sign(client);
      const signedXdr = clientTx.toXDR();

      const result = await authService.verifyChallenge(signedXdr);
      expect(result.token).toBeDefined();
      expect(result.user.publicKey).toBe(client.publicKey());

      const decoded = jwtService.verify<{ sub: string; publicKey: string }>(result.token);
      expect(decoded.publicKey).toBe(client.publicKey());
    });

    it('rejects challenge if signed by an attacker instead of the requested client', async () => {
      const client = Keypair.random();
      const attacker = Keypair.random();
      const challenge = authService.generateChallenge(client.publicKey());

      // Attacker signs the challenge
      const attackerTx = new Transaction(challenge.transaction, challenge.networkPassphrase);
      attackerTx.sign(attacker);
      const signedXdr = attackerTx.toXDR();

      await expect(authService.verifyChallenge(signedXdr)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired challenge transaction', async () => {
      const client = Keypair.random();
      const serverKeypair = Keypair.random();
      const now = Math.floor(Date.now() / 1000);

      // Build an already-expired transaction
      const expiredTx = new TransactionBuilder(
        new Account(serverKeypair.publicKey(), '0'),
        {
          fee: '100',
          networkPassphrase: Networks.TESTNET,
          timebounds: { minTime: now - 600, maxTime: now - 300 },
        },
      )
        .addOperation(
          Operation.manageData({
            source: client.publicKey(),
            name: 'lumenflow.app auth',
            value: 'nonce',
          }),
        )
        .build();

      expiredTx.sign(serverKeypair);
      expiredTx.sign(client);

      await expect(
        authService.verifyChallenge(expiredTx.toXDR()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects malformed XDR strings', async () => {
      await expect(authService.verifyChallenge('not-valid-xdr')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
