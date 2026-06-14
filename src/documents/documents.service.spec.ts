import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TextExtractionService } from '../document-processing/text-extraction.service';

const mockPrisma = {
  document: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockStorage = {
  save: jest.fn().mockResolvedValue('/uploads/user-1/doc-1/file.pdf'),
};

const mockExtraction = {
  extract: jest.fn().mockResolvedValue('Extracted text from the document.'),
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
});
