import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/filters/api-error.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    },
  });

  // Global exception filter for standardized ApiError JSON responses
  app.useGlobalFilters(new ApiErrorFilter());

  // OpenAPI Swagger Documentation
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
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'LumenFlow API Documentation',
  });

  const port = process.env['PORT'] ?? 4000;
  await app.listen(port);
  logger.log(
    JSON.stringify({
      message: 'LumenFlow API server started',
      port,
      docsUrl: `http://localhost:${port}/docs`,
      environment: process.env['NODE_ENV'] ?? 'development',
    }),
  );
}

void bootstrap();
