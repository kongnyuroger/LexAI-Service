import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StorageModule } from '../storage/storage.module';
import { DocumentProcessingModule } from '../document-processing/document-processing.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';

@Module({
  imports: [StorageModule, DocumentProcessingModule, AiModule, UsersModule, KnowledgeBaseModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
