import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger:
      process.env.NODE_ENV === 'production'
        ? ['log', 'warn', 'error']
        : ['log', 'debug', 'verbose', 'warn', 'error'],
  });

  // bodyParser disabled above so we can raise the limit past Express's
  // 100kb default — needed for large pasted legal texts (e.g. full
  // statute/code documents) submitted to /knowledge-base/sources.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Security headers
  app.use(helmet());

  // CORS — comma-separated origins in env var, defaulting to common dev ports.
  // This only matters for browser clients (lexai-web): browsers attach an
  // Origin header and enforce CORS themselves. Server-to-server callers like
  // lexai-whatsapp-bot send no Origin header at all, so the `cors` middleware
  // (via enableCors) doesn't apply to or block them — it has nothing to check.
  // ServiceAuthGuard (X-Service-Key), not CORS, is what actually authorizes
  // that caller. See README "Service-to-Service / WhatsApp Integration".
  const rawOrigins = process.env.CORS_ORIGINS ?? 'http://localhost:3001,http://localhost:19000';
  const origins = rawOrigins.split(',').map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  // Global pipes and filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger / OpenAPI docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('LexAI API')
    .setDescription(
      'AI-powered personal legal assistant — document analysis, contextual Q&A, and a Cameroonian legal knowledge base.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`API docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
