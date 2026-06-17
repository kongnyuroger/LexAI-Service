import { UnauthorizedException } from '@nestjs/common';
import { ServiceAuthGuard } from './service-auth.guard';

function buildContext(headers: Record<string, string>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as any;
}

describe('ServiceAuthGuard', () => {
  let guard: ServiceAuthGuard;
  const originalKey = process.env.SERVICE_API_KEY;

  beforeEach(() => {
    guard = new ServiceAuthGuard();
    process.env.SERVICE_API_KEY = 'test-service-key-123';
  });

  afterAll(() => {
    process.env.SERVICE_API_KEY = originalKey;
  });

  it('allows the request when the header matches SERVICE_API_KEY', () => {
    const result = guard.canActivate(
      buildContext({ 'x-service-key': 'test-service-key-123' }),
    );
    expect(result).toBe(true);
  });

  it('throws UnauthorizedException when the header is missing', () => {
    expect(() => guard.canActivate(buildContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the key is invalid', () => {
    expect(() =>
      guard.canActivate(buildContext({ 'x-service-key': 'wrong-key' })),
    ).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when SERVICE_API_KEY is not configured', () => {
    delete process.env.SERVICE_API_KEY;

    expect(() =>
      guard.canActivate(buildContext({ 'x-service-key': 'anything' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a key of different length without throwing from timingSafeEqual', () => {
    expect(() =>
      guard.canActivate(buildContext({ 'x-service-key': 'short' })),
    ).toThrow(UnauthorizedException);
  });
});
