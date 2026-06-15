import { ForbiddenException } from '@nestjs/common';
import { UsageLimitGuard } from './usage-limit.guard';
import { UsersService, PLAN_LIMITS } from '../users.service';

function buildContext(user: { id: string; plan: string }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('UsageLimitGuard', () => {
  let guard: UsageLimitGuard;
  let usersService: { getMonthlyUsage: jest.Mock };

  beforeEach(() => {
    usersService = { getMonthlyUsage: jest.fn() };
    guard = new UsageLimitGuard(usersService as unknown as UsersService);
  });

  it('always allows PREMIUM users without checking usage', async () => {
    const result = await guard.canActivate(
      buildContext({ id: 'u1', plan: 'PREMIUM' }),
    );

    expect(result).toBe(true);
    expect(usersService.getMonthlyUsage).not.toHaveBeenCalled();
  });

  it('allows a FREE user who is under the monthly limit', async () => {
    const limit = PLAN_LIMITS.FREE;
    usersService.getMonthlyUsage.mockResolvedValue({
      plan: 'FREE',
      used: limit - 1,
      limit,
      remaining: 1,
      resetAt: new Date(),
    });

    const result = await guard.canActivate(
      buildContext({ id: 'u2', plan: 'FREE' }),
    );

    expect(result).toBe(true);
  });

  it('throws ForbiddenException when a FREE user has reached the limit', async () => {
    const limit = PLAN_LIMITS.FREE;
    usersService.getMonthlyUsage.mockResolvedValue({
      plan: 'FREE',
      used: limit,
      limit,
      remaining: 0,
      resetAt: new Date(),
    });

    await expect(
      guard.canActivate(buildContext({ id: 'u3', plan: 'FREE' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('includes an upgrade message in the ForbiddenException', async () => {
    const limit = PLAN_LIMITS.FREE;
    usersService.getMonthlyUsage.mockResolvedValue({
      plan: 'FREE',
      used: limit,
      limit,
      remaining: 0,
      resetAt: new Date(),
    });

    await expect(
      guard.canActivate(buildContext({ id: 'u4', plan: 'FREE' })),
    ).rejects.toThrow(/Upgrade to PREMIUM/);
  });
});
