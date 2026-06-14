import { Module } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { AnalysisService } from './analysis.service';
import { EmbeddingService } from './embedding.service';

@Module({
  providers: [OpenAIService, AnalysisService, EmbeddingService],
  exports: [OpenAIService, AnalysisService, EmbeddingService],
})
export class AiModule {}
