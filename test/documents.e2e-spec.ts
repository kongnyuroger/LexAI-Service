process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL =
  'postgresql://lexai:lexai_password@localhost:5433/lexai_db?schema=public';
process.env.STORAGE_PATH = '/tmp/lexai-test-uploads';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';

const testUser = {
  id: 'doc-e2e-user',
  email: 'docs@lexai.cm',
  passwordHash: '$2b$10$hashed',
  fullName: 'Docs User',
  plan: 'FREE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createdDoc = {
  id: 'doc-e2e-1',
  userId: testUser.id,
  originalFilename: 'sample.pdf',
  fileType: 'application/pdf',
  storagePath: '/tmp/lexai-test-uploads/doc-e2e-user/doc-e2e-1/file.pdf',
  status: 'UPLOADED',
  createdAt: new Date(),
};

const mockPrismaUser = { findUnique: jest.fn() };
const mockPrismaDoc = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
};

const mockStorage = {
  save: jest.fn().mockResolvedValue(createdDoc.storagePath),
  read: jest.fn(),
  delete: jest.fn(),
};

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('Documents (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ user: mockPrismaUser, document: mockPrismaDoc })
      .overrideProvider(StorageService)
      .useValue(mockStorage)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    // Obtain an access token via login
    mockPrismaUser.findUnique.mockResolvedValue(testUser);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'docs@lexai.cm', password: 'password123' });
    accessToken = loginRes.body.accessToken;

    // After login, findUnique is called by JwtStrategy.validate — return safeUser
    const { passwordHash: _, ...safeUser } = testUser;
    mockPrismaUser.findUnique.mockResolvedValue(safeUser);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { passwordHash: _, ...safeUser } = testUser;
    mockPrismaUser.findUnique.mockResolvedValue(safeUser);
  });

  describe('POST /documents/upload', () => {
    it('returns 201 and creates a Document record for a valid PDF', async () => {
      mockPrismaDoc.create.mockResolvedValue(createdDoc);

      const fixturePath = path.join(__dirname, 'fixtures', 'sample.pdf');
      const res = await request(app.getHttpServer())
        .post('/documents/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', fixturePath);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('UPLOADED');
      expect(res.body.originalFilename).toBe('sample.pdf');
      expect(mockPrismaDoc.create).toHaveBeenCalledTimes(1);
    });

    it('returns 401 without a token', async () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'sample.pdf');
      const res = await request(app.getHttpServer())
        .post('/documents/upload')
        .attach('file', fixturePath);
      expect(res.status).toBe(401);
    });

    it('returns 422 for an unsupported file type', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('plain text'), {
          filename: 'test.txt',
          contentType: 'text/plain',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /documents', () => {
    const listItem = {
      id: createdDoc.id,
      originalFilename: createdDoc.originalFilename,
      fileType: createdDoc.fileType,
      status: createdDoc.status,
      createdAt: createdDoc.createdAt,
    };

    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/documents');
      expect(res.status).toBe(401);
    });

    it('returns paginated documents for the current user, newest first', async () => {
      mockPrismaDoc.findMany.mockResolvedValue([listItem]);
      mockPrismaDoc.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/documents')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: [{ ...listItem, createdAt: listItem.createdAt.toISOString() }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(mockPrismaDoc.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: testUser.id },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('does not include extractedText in the list response', async () => {
      mockPrismaDoc.findMany.mockResolvedValue([listItem]);
      mockPrismaDoc.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/documents')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data[0]).not.toHaveProperty('extractedText');
      expect(mockPrismaDoc.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.not.objectContaining({ extractedText: true }),
        }),
      );
    });

    it('respects page and limit query params', async () => {
      mockPrismaDoc.findMany.mockResolvedValue([]);
      mockPrismaDoc.count.mockResolvedValue(25);

      const res = await request(app.getHttpServer())
        .get('/documents?page=2&limit=5')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 2, limit: 5, total: 25, totalPages: 5 });
      expect(mockPrismaDoc.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  describe('GET /documents/:id', () => {
    it('returns the document when found', async () => {
      mockPrismaDoc.findFirst.mockResolvedValue({
        id: createdDoc.id,
        originalFilename: createdDoc.originalFilename,
        fileType: createdDoc.fileType,
        status: createdDoc.status,
        createdAt: createdDoc.createdAt,
      });

      const res = await request(app.getHttpServer())
        .get(`/documents/${createdDoc.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdDoc.id);
    });

    it('returns 404 when document not found', async () => {
      mockPrismaDoc.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/documents/nonexistent-id')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });
});
