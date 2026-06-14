import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService, PLAN_LIMITS } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: { findUniqueOrThrow: jest.fn() },
  document: { count: jest.fn() },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('PLAN_LIMITS', () => {
    it('FREE limit is 3', () => expect(PLAN_LIMITS.FREE).toBe(3));
    it('PREMIUM limit is Infinity', () =>
      expect(PLAN_LIMITS.PREMIUM).toBe(Infinity));
  });

  describe('getMonthlyUsage', () => {
    it('returns correct usage for FREE user under the limit', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'FREE' });
      mockPrisma.document.count.mockResolvedValue(1);

      const result = await service.getMonthlyUsage('user-1');

      expect(result.plan).toBe('FREE');
      expect(result.used).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.remaining).toBe(2);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('returns remaining=0 when FREE user has hit the limit', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'FREE' });
      mockPrisma.document.count.mockResolvedValue(3);

      const result = await service.getMonthlyUsage('user-1');

      expect(result.used).toBe(3);
      expect(result.remaining).toBe(0);
    });

    it('returns null limit and remaining for PREMIUM user', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'PREMIUM' });
      mockPrisma.document.count.mockResolvedValue(50);

      const result = await service.getMonthlyUsage('user-1');

      expect(result.limit).toBeNull();
      expect(result.remaining).toBeNull();
      expect(result.used).toBe(50);
    });

    it('queries only ANALYZED documents from the current month', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'FREE' });
      mockPrisma.document.count.mockResolvedValue(0);

      await service.getMonthlyUsage('user-1');

      const countArgs = mockPrisma.document.count.mock.calls[0][0];
      expect(countArgs.where.status).toBe('ANALYZED');
      expect(countArgs.where.userId).toBe('user-1');
      expect(countArgs.where.createdAt.gte).toBeInstanceOf(Date);
    });
  });
});
