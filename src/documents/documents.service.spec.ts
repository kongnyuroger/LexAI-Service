import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TextExtractionService } from '../document-processing/text-extraction.service';
import { AnalysisService } from '../ai/analysis.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';

const mockPrisma = {
  $transaction: jest.fn(),
  document: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  analysis: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
  riskFlag: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockStorage = {
  save: jest.fn().mockResolvedValue('/uploads/user-1/doc-1/file.pdf'),
};

const mockExtraction = {
  extract: jest.fn().mockResolvedValue('Extracted text from the document.'),
};

const mockAnalysis = {
  analyzeText: jest.fn(),
};

const mockKb = {
  search: jest.fn().mockResolvedValue([]),
  formatContext: jest.fn().mockReturnValue(''),
};

const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'contract.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 minimal'),
  size: 16,
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
};

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: TextExtractionService, useValue: mockExtraction },
        { provide: AnalysisService, useValue: mockAnalysis },
        { provide: KnowledgeBaseService, useValue: mockKb },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('saves the file, creates a Document record, and runs extraction', async () => {
      const updatedDoc = {
        id: 'doc-1',
        userId: 'user-1',
        originalFilename: 'contract.pdf',
        fileType: 'application/pdf',
        storagePath: '/uploads/user-1/doc-1/file.pdf',
        status: 'TEXT_EXTRACTED',
        extractedText: 'Extracted text from the document.',
        createdAt: new Date(),
      };
      mockPrisma.document.create.mockResolvedValue({ id: 'doc-1' });
      mockPrisma.document.update.mockResolvedValue(updatedDoc);

      const result = await service.upload(mockFile, 'user-1');

      expect(mockStorage.save).toHaveBeenCalledWith(
        mockFile.buffer,
        'contract.pdf',
        'user-1',
        expect.any(String),
      );
      expect(mockPrisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSING' }),
        }),
      );
      expect(mockExtraction.extract).toHaveBeenCalledWith(
        mockFile.buffer,
        'application/pdf',
      );
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'TEXT_EXTRACTED' }),
        }),
      );
      expect(result.status).toBe('TEXT_EXTRACTED');
    });

    it('sets status to FAILED if extraction throws', async () => {
      mockPrisma.document.create.mockResolvedValue({ id: 'doc-1' });
      mockExtraction.extract.mockRejectedValueOnce(new Error('OCR error'));
      mockPrisma.document.update.mockResolvedValue({ status: 'FAILED' });

      const result = await service.upload(mockFile, 'user-1');

      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
      expect(result.status).toBe('FAILED');
    });
  });

  describe('findAll', () => {
    const docs = [
      { id: 'doc-1', originalFilename: 'a.pdf', fileType: 'application/pdf', status: 'TEXT_EXTRACTED', createdAt: new Date() },
      { id: 'doc-2', originalFilename: 'b.pdf', fileType: 'application/pdf', status: 'ANALYZED', createdAt: new Date() },
    ];

    it('returns paginated documents and metadata', async () => {
      mockPrisma.document.findMany.mockResolvedValue(docs);
      mockPrisma.document.count.mockResolvedValue(2);

      const result = await service.findAll('user-1', 1, 10);

      expect(result.data).toEqual(docs);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('calculates correct skip offset for page 2', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(25);

      await service.findAll('user-1', 2, 10);

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('calculates totalPages correctly when items do not divide evenly', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(25);

      const result = await service.findAll('user-1', 1, 10);

      expect(result.totalPages).toBe(3);
    });

    it('filters documents by userId', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(0);

      await service.findAll('user-99', 1, 10);

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-99' } }),
      );
      expect(mockPrisma.document.count).toHaveBeenCalledWith({ where: { userId: 'user-99' } });
    });

    it('orders documents newest-first', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(0);

      await service.findAll('user-1', 1, 10);

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the document if it belongs to the user', async () => {
      const doc = { id: 'doc-1', status: 'TEXT_EXTRACTED' };
      mockPrisma.document.findFirst.mockResolvedValue(doc);

      const result = await service.findOne('doc-1', 'user-1');
      expect(result).toEqual(doc);
    });

    it('returns null when document does not belong to user', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);
      const result = await service.findOne('doc-1', 'other-user');
      expect(result).toBeNull();
    });
  });

  describe('analyze', () => {
    const analysisResult = {
      summary: {
        purpose: 'Employment contract',
        mainParties: ['Employer', 'Employee'],
        importantDates: ['2024-01-01'],
        moneyInvolved: ['50,000 XAF'],
        responsibilities: ['Pay salary'],
      },
      riskFlags: [
        { severity: 'HIGH', clauseText: 'No notice period.', explanation: 'Risky.' },
      ],
    };

    const savedAnalysis = {
      id: 'analysis-1',
      documentId: 'doc-1',
      summary: analysisResult.summary,
      parties: ['Employer', 'Employee'],
      importantDates: ['2024-01-01'],
      moneyDetails: ['50,000 XAF'],
      createdAt: new Date(),
    };

    it('throws NotFoundException when document does not exist', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(service.analyze('doc-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when document has no extracted text', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: 'PROCESSING',
        extractedText: null,
      });

      await expect(service.analyze('doc-1', 'user-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws UnprocessableEntityException when document status is FAILED', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: 'FAILED',
        extractedText: null,
      });

      await expect(service.analyze('doc-1', 'user-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('calls AnalysisService and persists results via $transaction', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        status: 'TEXT_EXTRACTED',
        extractedText: 'Contract text here.',
      });
      mockAnalysis.analyzeText.mockResolvedValue(analysisResult);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
        fn(mockPrisma),
      );
      mockPrisma.analysis.upsert.mockResolvedValue(savedAnalysis);
      mockPrisma.riskFlag.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.riskFlag.create.mockResolvedValue({ id: 'rf-1' });
      mockPrisma.document.update.mockResolvedValue({ status: 'ANALYZED' });

      const result = await service.analyze('doc-1', 'user-1');

      // legalContext is '' (empty from mockKb), which converts to undefined via || operator
      expect(mockAnalysis.analyzeText).toHaveBeenCalledWith('Contract text here.', undefined);
      expect(mockPrisma.analysis.upsert).toHaveBeenCalled();
      expect(mockPrisma.riskFlag.deleteMany).toHaveBeenCalledWith({ where: { documentId: 'doc-1' } });
      expect(mockPrisma.riskFlag.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ANALYZED' } }),
      );
      expect(result.riskFlags).toHaveLength(1);
    });
  });

  describe('findAnalysis', () => {
    it('throws NotFoundException when document does not exist', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(service.findAnalysis('doc-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when no analysis exists yet', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1' });
      mockPrisma.analysis.findUnique.mockResolvedValue(null);

      await expect(service.findAnalysis('doc-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns analysis with riskFlags', async () => {
      const savedAnalysis = { id: 'a-1', documentId: 'doc-1', summary: {}, parties: [] };
      const savedFlags = [{ id: 'rf-1', severity: 'HIGH', clauseText: 'clause', explanation: 'bad' }];

      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1' });
      mockPrisma.analysis.findUnique.mockResolvedValue(savedAnalysis);
      mockPrisma.riskFlag.findMany.mockResolvedValue(savedFlags);

      const result = await service.findAnalysis('doc-1', 'user-1');

      expect(result.riskFlags).toEqual(savedFlags);
    });
  });
});
