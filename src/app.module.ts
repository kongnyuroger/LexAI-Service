import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DocumentsModule } from './documents/documents.module';
import { DocumentProcessingModule } from './document-processing/document-processing.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, DocumentsModule, DocumentProcessingModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
