import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TextExtractionService } from '../document-processing/text-extraction.service';
import { AnalysisService } from '../ai/analysis.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';

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
    private analysis: AnalysisService,
    private kb: KnowledgeBaseService,
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

  async findAll(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where: { userId },
        select: {
          id: true,
          originalFilename: true,
          fileType: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.document.count({ where: { userId } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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

  async analyze(documentId: string, userId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!doc) throw new NotFoundException('Document not found');

    if (doc.status === 'FAILED') {
      throw new UnprocessableEntityException(
        'Document processing failed. Please re-upload the document.',
      );
    }

    if (!doc.extractedText) {
      throw new UnprocessableEntityException(
        'Document text has not been extracted yet. Please try again shortly.',
      );
    }

    // Enrich analysis with relevant legal provisions from the knowledge base
    const kbResults = await this.kb.search(doc.extractedText.slice(0, 1000));
    const legalContext = this.kb.formatContext(kbResults);

    const result = await this.analysis.analyzeText(doc.extractedText, legalContext || undefined);

    return this.prisma.$transaction(async (tx) => {
      const savedAnalysis = await tx.analysis.upsert({
        where: { documentId },
        create: {
          documentId,
          summary: result.summary as object,
          parties: result.summary.mainParties,
          importantDates: result.summary.importantDates,
          moneyDetails: result.summary.moneyInvolved,
        },
        update: {
          summary: result.summary as object,
          parties: result.summary.mainParties,
          importantDates: result.summary.importantDates,
          moneyDetails: result.summary.moneyInvolved,
        },
      });

      // Replace any existing risk flags (re-analysis scenario)
      await tx.riskFlag.deleteMany({ where: { documentId } });

      const riskFlags = await Promise.all(
        result.riskFlags.map((flag) =>
          tx.riskFlag.create({
            data: {
              documentId,
              severity: flag.severity,
              clauseText: flag.clauseText,
              explanation: flag.explanation,
            },
          }),
        ),
      );

      await tx.document.update({
        where: { id: documentId },
        data: { status: 'ANALYZED' },
      });

      return { ...savedAnalysis, riskFlags };
    });
  }

  async findAnalysis(documentId: string, userId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true },
    });

    if (!doc) throw new NotFoundException('Document not found');

    const savedAnalysis = await this.prisma.analysis.findUnique({
      where: { documentId },
    });

    if (!savedAnalysis) {
      throw new NotFoundException(
        'No analysis found for this document. Run POST /documents/:id/analyze first.',
      );
    }

    const riskFlags = await this.prisma.riskFlag.findMany({
      where: { documentId },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    });

    return { ...savedAnalysis, riskFlags };
  }
}
