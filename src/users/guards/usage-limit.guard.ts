import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService, PLAN_LIMITS } from '../users.service';

// Apply this guard on any endpoint that consumes a monthly analysis slot
// (e.g. POST /documents/:id/analyze). FREE users are blocked once they
// reach 3 analyses/month; PREMIUM users are never blocked.
@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(private users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { id: string; plan: string };

    const limit = PLAN_LIMITS[user.plan];
    if (limit === Infinity) return true; // PREMIUM: always allow

    const usage = await this.users.getMonthlyUsage(user.id);
    if (usage.used >= limit) {
      throw new ForbiddenException(
        `Monthly analysis limit reached (${limit}/${limit}). ` +
          `Upgrade to PREMIUM for unlimited analyses.`,
      );
    }

    return true;
  }
}
