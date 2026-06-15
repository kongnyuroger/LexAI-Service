process.env.JWT_ACCESS_SECRET = 'test-access-secret';

import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  const payload: JwtPayload = { sub: 'user-123', email: 'user@lexai.cm' };

  const mockUser = {
    id: 'user-123',
    email: 'user@lexai.cm',
    fullName: 'Test User',
    plan: 'FREE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
    jest.clearAllMocks();
  });

  it('returns the user when found in the database', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await strategy.validate(payload);

    expect(result).toEqual(mockUser);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-123' } }),
    );
  });

  it('queries with the correct field selection', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    await strategy.validate(payload);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true, email: true, plan: true }),
      }),
    );
  });

  it('throws UnauthorizedException when the user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
