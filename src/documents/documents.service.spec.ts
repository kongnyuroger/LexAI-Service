import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const mockPrisma = {
  document: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockStorage = {
  save: jest.fn().mockResolvedValue('/uploads/user-1/doc-1/file.pdf'),
  read: jest.fn(),
  delete: jest.fn(),
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
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('saves the file and creates a Document record', async () => {
      const created = {
        id: 'doc-1',
        userId: 'user-1',
        originalFilename: 'contract.pdf',
        fileType: 'application/pdf',
        storagePath: '/uploads/user-1/doc-1/file.pdf',
        status: 'UPLOADED',
        createdAt: new Date(),
      };
      mockPrisma.document.create.mockResolvedValue(created);

      const result = await service.upload(mockFile, 'user-1');

      expect(mockStorage.save).toHaveBeenCalledWith(
        mockFile.buffer,
        'contract.pdf',
        'user-1',
        expect.any(String),
      );
      expect(mockPrisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            originalFilename: 'contract.pdf',
            fileType: 'application/pdf',
            status: 'UPLOADED',
          }),
        }),
      );
      expect(result.status).toBe('UPLOADED');
    });
  });

  describe('findOne', () => {
    it('returns the document if it belongs to the user', async () => {
      const doc = { id: 'doc-1', status: 'UPLOADED' };
      mockPrisma.document.findFirst.mockResolvedValue(doc);

      const result = await service.findOne('doc-1', 'user-1');
      expect(result).toEqual(doc);
      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1', userId: 'user-1' },
        }),
      );
    });

    it('returns null when document does not belong to user', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);
      const result = await service.findOne('doc-1', 'other-user');
      expect(result).toBeNull();
    });
  });
});
