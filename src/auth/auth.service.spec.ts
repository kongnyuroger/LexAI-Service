import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

const mockUser = {
  id: 'user-1',
  email: 'test@lexai.cm',
  passwordHash: '$2b$10$hashedpassword',
  fullName: 'Test User',
  plan: 'FREE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockWhatsappUser = {
  id: 'user-wa-1',
  email: null,
  phoneNumber: '+237670000000',
  passwordHash: null,
  authProvider: 'WHATSAPP' as const,
  fullName: 'WhatsApp User',
  plan: 'FREE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-token'),
  verify: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const { passwordHash: _, ...safeUser } = mockUser;
      mockPrisma.user.create.mockResolvedValue(safeUser);

      const result = await service.register({
        email: 'test@lexai.cm',
        password: 'password123',
        fullName: 'Test User',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('test@lexai.cm');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@lexai.cm',
          password: 'password123',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'test@lexai.cm',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'no@one.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@lexai.cm', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('whatsappLink', () => {
    it('creates a new user with a default fullName when no displayName is given', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockWhatsappUser);

      const result = await service.whatsappLink({
        phoneNumber: '+237670000000',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phoneNumber: '+237670000000',
            fullName: 'WhatsApp User',
            authProvider: 'WHATSAPP',
          }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('uses the provided displayName as fullName for a new user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        ...mockWhatsappUser,
        fullName: 'Alice N.',
      });

      await service.whatsappLink({
        phoneNumber: '+237670000000',
        displayName: 'Alice N.',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fullName: 'Alice N.' }),
        }),
      );
    });

    it('is idempotent: returns the existing user without creating a duplicate', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockWhatsappUser);

      const result = await service.whatsappLink({
        phoneNumber: '+237670000000',
      });

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe(mockWhatsappUser.id);
      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('refresh', () => {
    it('returns a new access token for a valid refresh token', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'test@lexai.cm' });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refresh('valid-refresh-token');
      expect(result).toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException for an invalid refresh token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
