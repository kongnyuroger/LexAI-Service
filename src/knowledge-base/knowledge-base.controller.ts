import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { KnowledgeBaseService } from './knowledge-base.service';
import { IngestSourceDto } from './dto/ingest-source.dto';
import { IngestSourceFileDto } from './dto/ingest-source-file.dto';
import { TextExtractionService } from '../document-processing/text-extraction.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_MIME_TYPES =
  /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

// TODO (Task 10 / future): add an Admin role guard so only staff can ingest
// legal sources. For now, any authenticated user is allowed (internal tool).
@ApiTags('knowledge-base')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(
    private kb: KnowledgeBaseService,
    private textExtraction: TextExtractionService,
  ) {}

  @Post('sources/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary: 'Ingest a legal source from an uploaded file (PDF or DOCX)',
    description:
      'Extracts text from the uploaded file, then chunks, embeds, and stores it the same way as POST /knowledge-base/sources. Use this instead of pasting raw text into the JSON endpoint to avoid invalid-JSON errors from control characters.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string', example: 'Cameroonian Labour Code' },
        jurisdiction: { type: 'string', example: 'Cameroon' },
        sourceType: { type: 'string', example: 'statute' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Returns { chunksCreated: number }.' })
  @ApiResponse({ status: 400, description: 'File too large (max 10 MB) or unsupported type.' })
  async ingestFromFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_BYTES }),
          new FileTypeValidator({
            fileType: ACCEPTED_MIME_TYPES,
            skipMagicNumbersValidation: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: IngestSourceFileDto,
  ) {
    const content = await this.textExtraction.extract(file.buffer, file.mimetype);
    return this.kb.ingest(dto.title, dto.jurisdiction, dto.sourceType, content);
  }

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
