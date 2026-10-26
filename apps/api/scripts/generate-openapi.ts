import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from '../dist/app.module.js';

async function generateOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('LumenFlow API')
    .setDescription(
      'Stellar-based platform for non-custodial swaps, cross-chain bridging, and crypto offramps.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter session JWT obtained from /auth/verify',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'SEP-10 wallet authentication and challenge verification')
    .addTag('Swap', 'Live quotes, unsigned transaction building, and submission')
    .addTag('Assets', 'Supported Stellar assets on testnet')
    .addTag('Orders', 'Order status tracking and transaction history')
    .addTag('Bridge', 'Cross-chain bridge stubs (external providers)')
    .addTag('Offramp', 'Anchor/payout offramp stubs (external providers)')
    .addTag('Webhooks', 'Provider webhook stubs')
    .addTag('Health', 'System and external service connectivity health check')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = path.resolve(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');
  console.log(`OpenAPI schema successfully written to ${outputPath}`);

  await app.close();
}

void generateOpenApi();
