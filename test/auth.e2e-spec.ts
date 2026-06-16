// Set required env vars before any module imports
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.SERVICE_API_KEY = 'test-service-key';
process.env.DATABASE_URL =
  'postgresql://lexai:lexai_password@localhost:5433/lexai_db?schema=public';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Shared mock state so individual tests can control DB responses
const mockDb = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashed'),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

const testUser = {
  id: 'e2e-user-1',
  email: 'e2e@lexai.cm',
  passwordHash: '$2b$10$hashed',
  fullName: 'E2E User',
  plan: 'FREE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testWhatsappUser = {
  id: 'e2e-wa-user-1',
  email: null,
  phoneNumber: '+237670000000',
  passwordHash: null,
  authProvider: 'WHATSAPP',
  fullName: 'WhatsApp User',
  plan: 'FREE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ user: mockDb.user })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // ── POST /auth/register ─────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('returns 201 with tokens and user on success', async () => {
      mockDb.user.findUnique.mockResolvedValue(null);
      const { passwordHash: _, ...safeUser } = testUser;
      mockDb.user.create.mockResolvedValue(safeUser);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e@lexai.cm',
          password: 'password123',
          fullName: 'E2E User',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe('e2e@lexai.cm');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('returns 409 if email already exists', async () => {
      mockDb.user.findUnique.mockResolvedValue(testUser);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e@lexai.cm',
          password: 'password123',
          fullName: 'E2E User',
        });

      expect(res.status).toBe(409);
    });

    it('returns 400 for invalid input (short password)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'bad@email.com', password: 'short', fullName: 'X' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /auth/login ────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns 201 with tokens on valid credentials', async () => {
      mockDb.user.findUnique.mockResolvedValue(testUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'e2e@lexai.cm', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('returns 401 for wrong password', async () => {
      mockDb.user.findUnique.mockResolvedValue(testUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'e2e@lexai.cm', password: 'wrong' });

      expect(res.status).toBe(401);
    });
  });

  // ── POST /auth/whatsapp-link ─────────────────────────────────────────────────

  describe('POST /auth/whatsapp-link', () => {
    it('returns 401 when X-Service-Key header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/whatsapp-link')
        .send({ phoneNumber: '+237670000000' });

      expect(res.status).toBe(401);
    });

    it('returns 401 when X-Service-Key header is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/whatsapp-link')
        .set('X-Service-Key', 'wrong-key')
        .send({ phoneNumber: '+237670000000' });

      expect(res.status).toBe(401);
    });

    it('returns 400 for an invalid phone number format', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/whatsapp-link')
        .set('X-Service-Key', 'test-service-key')
        .send({ phoneNumber: 'not-a-phone-number' });

      expect(res.status).toBe(400);
    });

    it('creates a new user and returns tokens on first contact', async () => {
      mockDb.user.findUnique.mockResolvedValue(null);
      mockDb.user.create.mockResolvedValue(testWhatsappUser);

      const res = await request(app.getHttpServer())
        .post('/auth/whatsapp-link')
        .set('X-Service-Key', 'test-service-key')
        .send({ phoneNumber: '+237670000000', displayName: 'WhatsApp User' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.phoneNumber).toBe('+237670000000');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('is idempotent: a second call for the same phone number does not create a duplicate', async () => {
      mockDb.user.findUnique.mockResolvedValue(testWhatsappUser);

      const res = await request(app.getHttpServer())
        .post('/auth/whatsapp-link')
        .set('X-Service-Key', 'test-service-key')
        .send({ phoneNumber: '+237670000000' });

      expect(res.status).toBe(200);
      expect(mockDb.user.create).not.toHaveBeenCalled();
      expect(res.body.user.id).toBe(testWhatsappUser.id);
    });
  });

  // ── GET /auth/me ────────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 200 with user info when authenticated', async () => {
      // First log in to get a real access token
      mockDb.user.findUnique.mockResolvedValue(testUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'e2e@lexai.cm', password: 'password123' });

      const { accessToken } = loginRes.body;

      // JwtStrategy.validate calls prisma.user.findUnique again
      const { passwordHash: _, ...safeUser } = testUser;
      mockDb.user.findUnique.mockResolvedValue(safeUser);

      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.email).toBe('e2e@lexai.cm');
    });
  });
});
