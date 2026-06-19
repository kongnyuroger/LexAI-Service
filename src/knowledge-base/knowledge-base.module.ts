import { Module } from '@nestjs/common';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AiModule } from '../ai/ai.module';
import { DocumentProcessingModule } from '../document-processing/document-processing.module';

@Module({
  imports: [AiModule, DocumentProcessingModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
