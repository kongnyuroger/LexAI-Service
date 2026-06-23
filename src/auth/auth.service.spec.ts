import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

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

const mockGoogleUser = {
  id: 'user-google-1',
  email: 'alice@gmail.com',
  phoneNumber: null,
  googleId: 'google-sub-123',
  avatarUrl: 'https://lh3.googleusercontent.com/alice.jpg',
  passwordHash: null,
  authProvider: 'GOOGLE' as const,
  fullName: 'Alice N.',
  plan: 'FREE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSupabaseProfile = {
  id: 'google-sub-123',
  email: 'alice@gmail.com',
  user_metadata: {
    full_name: 'Alice N.',
    avatar_url: 'https://lh3.googleusercontent.com/alice.jpg',
  },
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-token'),
  verify: jest.fn(),
};

const mockSupabase = {
  verifyToken: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: SupabaseService, useValue: mockSupabase },
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

  describe('googleLogin', () => {
    it('creates a new user when no existing record matches by googleId or email', async () => {
      mockSupabase.verifyToken.mockResolvedValue(mockSupabaseProfile);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // lookup by googleId
        .mockResolvedValueOnce(null); // lookup by email
      mockPrisma.user.create.mockResolvedValue(mockGoogleUser);

      const result = await service.googleLogin('supabase-access-token');

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleId: 'google-sub-123',
            email: 'alice@gmail.com',
            fullName: 'Alice N.',
            avatarUrl: 'https://lh3.googleusercontent.com/alice.jpg',
            authProvider: 'GOOGLE',
            plan: 'FREE',
          }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('links an existing email/password user onto the same record instead of creating a duplicate', async () => {
      const existingEmailUser = { ...mockUser, googleId: null, avatarUrl: null };
      mockSupabase.verifyToken.mockResolvedValue(mockSupabaseProfile);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // lookup by googleId — not found
        .mockResolvedValueOnce(existingEmailUser); // lookup by email — found
      mockPrisma.user.update.mockResolvedValue({
        ...existingEmailUser,
        googleId: 'google-sub-123',
        avatarUrl: 'https://lh3.googleusercontent.com/alice.jpg',
        authProvider: 'GOOGLE',
      });

      const result = await service.googleLogin('supabase-access-token');

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: existingEmailUser.id },
        data: {
          googleId: 'google-sub-123',
          avatarUrl: 'https://lh3.googleusercontent.com/alice.jpg',
          authProvider: 'GOOGLE',
        },
      });
      expect(result.user.id).toBe(existingEmailUser.id);
      expect(result).toHaveProperty('accessToken');
    });

    it('returns fresh tokens for an existing Google user without creating or updating', async () => {
      mockSupabase.verifyToken.mockResolvedValue(mockSupabaseProfile);
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockGoogleUser); // found by googleId

      const result = await service.googleLogin('supabase-access-token');

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(result.user.id).toBe(mockGoogleUser.id);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('propagates UnauthorizedException for an invalid Supabase token', async () => {
      mockSupabase.verifyToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired Google session'),
      );

      await expect(service.googleLogin('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
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
