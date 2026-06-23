import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseUser {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
  };
}

// Bridges Supabase's Google OAuth flow into our own auth system: this client
// only ever verifies a short-lived Supabase access token and reads back the
// Google profile it carries (see AuthService.googleLogin). We never use
// Supabase's database, session management, or JWTs beyond that single call —
// our own Postgres + our own JWT remain the source of truth.
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  // Built lazily (not in the constructor) so apps/tests that never touch
  // Google OAuth can boot without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set.
  private client: SupabaseClient | null = null;

  private getClient(): SupabaseClient {
    if (!this.client) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new Error(
          'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to verify Google OAuth tokens',
        );
      }
      this.client = createClient(url, key);
    }
    return this.client;
  }

  async verifyToken(token: string): Promise<SupabaseUser> {
    const { data, error } = await this.getClient().auth.getUser(token);

    if (error || !data.user) {
      this.logger.warn(`Supabase token verification failed: ${error?.message}`);
      throw new UnauthorizedException('Invalid or expired Google session');
    }

    return data.user as SupabaseUser;
  }
}
