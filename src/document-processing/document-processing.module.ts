import { Module } from '@nestjs/common';
import { TextExtractionService } from './text-extraction.service';

@Module({
  providers: [TextExtractionService],
  exports: [TextExtractionService],
})
export class DocumentProcessingModule {}
