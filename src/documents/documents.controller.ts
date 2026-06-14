import {
  Controller,
  Post,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_MIME_TYPES =
  /^(application\/pdf|image\/(jpeg|png)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

interface AuthUser {
  id: string;
}

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
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

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const doc = await this.documents.findOne(id, user.id);
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}
