import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeBaseService } from './knowledge-base.service';
import { IngestSourceDto } from './dto/ingest-source.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// TODO (Task 10 / future): add an Admin role guard so only staff can ingest
// legal sources. For now, any authenticated user is allowed (internal tool).
@ApiTags('knowledge-base')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private kb: KnowledgeBaseService) {}

  @Post('sources')
  @ApiOperation({
    summary: 'Ingest a legal source into the knowledge base',
    description:
      'Chunks the provided text, generates embeddings via text-embedding-3-small, and stores them in pgvector for RAG retrieval.',
  })
  @ApiResponse({ status: 201, description: 'Returns { chunksCreated: number }.' })
  @ApiResponse({ status: 400, description: 'Validation error (e.g. content too short).' })
  ingest(@Body() dto: IngestSourceDto) {
    return this.kb.ingest(
      dto.title,
      dto.jurisdiction,
      dto.sourceType,
      dto.content,
    );
  }
}
