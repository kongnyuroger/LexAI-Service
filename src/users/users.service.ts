import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const PLAN_LIMITS: Record<string, number> = {
  FREE: 3,
  PREMIUM: Infinity,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMonthlyUsage(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });

    const analyzedCount = await this.prisma.document.count({
      where: {
        userId,
        status: 'ANALYZED',
        createdAt: { gte: startOfMonth },
      },
    });

    const limit = PLAN_LIMITS[user.plan];

    return {
      plan: user.plan,
      used: analyzedCount,
      limit: limit === Infinity ? null : limit,
      remaining: limit === Infinity ? null : Math.max(0, limit - analyzedCount),
      resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
}
