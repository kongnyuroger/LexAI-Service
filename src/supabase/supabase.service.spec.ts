process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

const mockSupabaseUser = {
  id: 'google-sub-123',
  email: 'alice@gmail.com',
  user_metadata: {
    full_name: 'Alice N.',
    avatar_url: 'https://lh3.googleusercontent.com/alice.jpg',
  },
};

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseService],
    }).compile();

    service = module.get<SupabaseService>(SupabaseService);
    jest.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('returns the Supabase user for a valid token', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockSupabaseUser }, error: null });

      const result = await service.verifyToken('valid-token');

      expect(result).toEqual(mockSupabaseUser);
      expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    });

    it('throws UnauthorizedException when Supabase returns an error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid JWT' },
      });

      await expect(service.verifyToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when no user is returned', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      await expect(service.verifyToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws a clear error when Supabase env vars are not configured', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(service.verifyToken('any-token')).rejects.toThrow(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
      );

      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    });
  });
});
