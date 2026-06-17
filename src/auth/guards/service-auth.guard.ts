import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

const SERVICE_KEY_HEADER = 'x-service-key';

// MVP service-to-service auth: a single static shared secret (SERVICE_API_KEY)
// for one trusted internal caller (lexai-whatsapp-bot). No database table,
// no rotation, no per-service scoping — appropriate for a single trusted
// caller, not for serving multiple external services. A production system
// with several external integrations should replace this with scoped,
// database-backed API keys (hashed at rest, individually revocable, audited).
//
// This guard proves *which service* is calling (i.e. lexai-whatsapp-bot, not
// some arbitrary caller). It does not identify an end-user — endpoints behind
// it must take an explicit identifier (e.g. phoneNumber) for which user
// they're acting on behalf of. See AuthController.whatsappLink.
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers[SERVICE_KEY_HEADER];
    const expectedKey = process.env.SERVICE_API_KEY;

    if (!expectedKey) {
      this.logger.error(
        'SERVICE_API_KEY is not configured — rejecting all service-to-service requests',
      );
      throw new UnauthorizedException('Service authentication is not configured');
    }

    if (typeof providedKey !== 'string' || !this.matches(providedKey, expectedKey)) {
      throw new UnauthorizedException('Invalid or missing service API key');
    }

    return true;
  }

  // Constant-time comparison so key validation doesn't leak timing information.
  private matches(provided: string, expected: string): boolean {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}
