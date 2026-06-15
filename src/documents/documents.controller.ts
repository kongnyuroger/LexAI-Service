import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  NotFoundException,
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
  ApiQuery,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsageLimitGuard } from '../users/guards/usage-limit.guard';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_MIME_TYPES =
  /^(application\/pdf|image\/(jpeg|png)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

interface AuthUser {
  id: string;
}

@ApiTags('documents')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Upload a legal document (PDF, image, or DOCX)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded and text extracted. Returns document record.' })
  @ApiResponse({ status: 400, description: 'File too large (max 10 MB) or unsupported type.' })
  upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_BYTES }),
          // skipMagicNumbersValidation: validate against Content-Type header
          // (set by Multer from the multipart form) rather than using the
          // file-type ESM package to read buffer magic bytes.
          new FileTypeValidator({
            fileType: ACCEPTED_MIME_TYPES,
            skipMagicNumbersValidation: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.upload(file, user.id);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's documents (newest first, paginated)" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Returns { data, total, page, limit, totalPages }.',
  })
  findAll(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.documents.findAll(user.id, query.page ?? 1, query.limit ?? 10);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata and status' })
  @ApiResponse({ status: 200, description: 'Returns document metadata (without extracted text).' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const doc = await this.documents.findOne(id, user.id);
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  @Post(':id/analyze')
  @UseGuards(UsageLimitGuard)
  @ApiOperation({ summary: 'Run AI analysis on the document (summarize + detect risk clauses)' })
  @ApiResponse({ status: 201, description: 'Analysis complete. Returns summary and risk flags.' })
  @ApiResponse({ status: 403, description: 'Monthly analysis limit reached (FREE plan).' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  @ApiResponse({ status: 422, description: 'Document text not yet extracted.' })
  analyze(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.analyze(id, user.id);
  }

  @Get(':id/analysis')
  @ApiOperation({ summary: 'Retrieve the saved analysis for a document' })
  @ApiResponse({ status: 200, description: 'Returns analysis with summary and risk flags.' })
  @ApiResponse({ status: 404, description: 'Document not found or not yet analyzed.' })
  findAnalysis(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.findAnalysis(id, user.id);
  }
}
