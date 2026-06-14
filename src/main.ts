import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // CORS — comma-separated origins in env var, defaulting to common dev ports
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
  console.log(`LexAI server running on http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
