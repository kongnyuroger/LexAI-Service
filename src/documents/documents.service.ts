import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TextExtractionService } from '../document-processing/text-extraction.service';

// TODO (production): move text extraction to a background job queue
// (e.g. BullMQ) so the upload response returns immediately and extraction
// runs asynchronously. Synchronous extraction is fine for the MVP.
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private extraction: TextExtractionService,
  ) {}

  async upload(file: Express.Multer.File, userId: string) {
    const documentId = randomUUID();

    const storagePath = await this.storage.save(
      file.buffer,
      file.originalname,
      userId,
      documentId,
    );

    // Create the record immediately so the client gets a document ID back
    await this.prisma.document.create({
      data: {
        id: documentId,
        userId,
        originalFilename: file.originalname,
        fileType: file.mimetype,
        storagePath,
        status: 'PROCESSING',
      },
    });

    // Run extraction and update status (synchronous for MVP)
    let extractedText: string | null = null;
    let finalStatus: 'TEXT_EXTRACTED' | 'FAILED' = 'TEXT_EXTRACTED';

    try {
      extractedText = await this.extraction.extract(file.buffer, file.mimetype);
    } catch (err) {
      this.logger.error(
        `Text extraction failed for document ${documentId}: ${(err as Error).message}`,
      );
      finalStatus = 'FAILED';
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: { status: finalStatus, extractedText },
    });
  }

  async findOne(documentId: string, userId: string) {
    return this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: {
        id: true,
        originalFilename: true,
        fileType: true,
        status: true,
        createdAt: true,
        // extractedText intentionally omitted — use /analyze for AI results
      },
    });
  }
}
