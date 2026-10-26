import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const TestSchema = z.object({
    amount: z.string().min(1),
    rate: z.number().positive(),
  });

  const pipe = new ZodValidationPipe(TestSchema);

  it('passes valid input and returns parsed data', () => {
    const input = { amount: '100', rate: 1.5 };
    const result = pipe.transform(input, { type: 'body' });
    expect(result).toEqual(input);
  });

  it('throws BadRequestException on invalid input schema', () => {
    const input = { amount: '', rate: -5 };
    expect(() => pipe.transform(input, { type: 'body' })).toThrow(
      BadRequestException,
    );
  });

  it('returns structured error issues when validation fails', () => {
    try {
      pipe.transform({ amount: 123 }, { type: 'body' });
      expect.fail('Should have thrown BadRequestException');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BadRequestException);
      const res = (err as BadRequestException).getResponse() as Record<string, unknown>;
      expect(res['code']).toBe('VALIDATION_ERROR');
      expect(res['details']).toBeDefined();
    }
  });
});
