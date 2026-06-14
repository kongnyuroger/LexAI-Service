import {
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function buildHost(url = '/test') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { url, method: 'GET' };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
    json,
    status,
    response,
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('returns the correct status and string message for an HttpException', () => {
    const host = buildHost('/documents/abc');
    filter.catch(new NotFoundException('Document not found'), host as any);

    expect(host.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Document not found',
        path: '/documents/abc',
      }),
    );
  });

  it('extracts the message array from a BadRequestException body', () => {
    const host = buildHost('/auth/register');
    // NestJS ValidationPipe produces { message: string[], error: 'Bad Request', statusCode: 400 }
    const exception = new BadRequestException({
      message: ['email must be an email', 'password is too short'],
      error: 'Bad Request',
      statusCode: 400,
    });
    filter.catch(exception, host as any);

    expect(host.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const payload = host.json.mock.calls[0][0];
    expect(Array.isArray(payload.message)).toBe(true);
    expect(payload.message).toContain('email must be an email');
  });

  it('returns 500 for a non-HTTP exception', () => {
    const host = buildHost('/health');
    filter.catch(new Error('Database connection lost'), host as any);

    expect(host.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    );
  });

  it('includes a timestamp and path in every response', () => {
    const host = buildHost('/some/path');
    filter.catch(new HttpException('Forbidden', HttpStatus.FORBIDDEN), host as any);

    const payload = host.json.mock.calls[0][0];
    expect(payload.timestamp).toBeDefined();
    expect(() => new Date(payload.timestamp)).not.toThrow();
    expect(payload.path).toBe('/some/path');
  });
});
