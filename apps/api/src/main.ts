import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/filters/api-error.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Initialize Sentry early if DSN is provided
  const sentryDsn = process.env['SENTRY_DSN'];
  if (sentryDsn && sentryDsn.trim() !== '') {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env['NODE_ENV'] ?? 'development',
      tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
    });
    logger.log('Sentry error tracking initialized for LumenFlow API');
  }

  const app = await NestFactory.create(AppModule);

  // Strict CORS configuration
  const allowedOriginsEnv = process.env['CORS_ALLOWED_ORIGINS'];
  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests without Origin (like server-to-server curl, webhooks, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new Error(`Origin '${origin}' blocked by strict CORS policy.`),
          false,
        );
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'x-webhook-signature',
      'x-signature',
      'x-webhook-timestamp',
      'x-timestamp',
      'x-correlation-id',
      'x-admin-key',
    ],
    exposedHeaders: ['x-correlation-id', 'Idempotency-Key'],
    credentials: true,
    maxAge: 86400,
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
    .addTag('Observability', 'Prometheus operational metrics exposition')
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
      metricsUrl: `http://localhost:${port}/metrics`,
      environment: process.env['NODE_ENV'] ?? 'development',
    }),
  );
}

void bootstrap();
