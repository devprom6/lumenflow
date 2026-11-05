import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

@Injectable()
export class TotpService {
  private readonly window = 1; // allow 1 step clock drift
  private readonly stepSeconds = 30;

  generateSecret(): string {
    return crypto.randomBytes(20).toString('base64url');
  }

  generateTotp(secret: string, timeStep?: number): string {
    const step = timeStep ?? Math.floor(Date.now() / 1000 / this.stepSeconds);
    const counter = Buffer.alloc(8);
    counter.writeBigInt64BE(BigInt(step));
    const keyBuffer = Buffer.from(secret, 'base64url');
    const hmac = crypto.createHmac('sha1', keyBuffer).update(counter).digest();
    const offset = hmac[hmac.length - 1]! & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return String(code).padStart(6, '0');
  }

  verifyTotp(secret: string, token: string): boolean {
    const step = Math.floor(Date.now() / 1000 / this.stepSeconds);
    for (let i = -this.window; i <= this.window; i++) {
      if (this.generateTotp(secret, step + i) === token) return true;
    }
    return false;
  }

  getTotpUri(secret: string, account: string, issuer = 'LumenFlow'): string {
    const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params}`;
  }
}
