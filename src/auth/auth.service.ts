import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { WhatsappLinkDto } from './dto/whatsapp-link.dto';

const BCRYPT_ROUNDS = 10;

// MVP identity policy: email and phoneNumber are independent unique columns
// with no cross-linking. A WhatsApp-originated user (phoneNumber, no email)
// who later registers normally with an email gets a SEPARATE User row, not
// a merge of the two — register() only checks for an existing row by email,
// and whatsappLink() only checks by phoneNumber, so the two paths can never
// collide. This is a deliberate simplification, not an oversight: account
// merging (detecting "this is probably the same person" and unifying their
// documents/history under one User) is a documented future enhancement, not
// built here. See README "Service-to-Service / WhatsApp Integration".
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private supabase: SupabaseService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, fullName: dto.fullName },
      select: {
        id: true,
        email: true,
        fullName: true,
        plan: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const tokens = this.signTokens(user.id, dto.email);
    return { ...tokens, user };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // WhatsApp-originated users have no passwordHash and can't log in this way.
    if (!user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const { passwordHash: _, ...safeUser } = user;
    const tokens = this.signTokens(user.id, dto.email);
    return { ...tokens, user: safeUser };
  }

  // Finds or creates a user by phone number and issues tokens. Only reachable
  // via ServiceAuthGuard (trusted internal callers, e.g. lexai-whatsapp-bot) —
  // see auth.controller.ts. Idempotent: repeat calls for the same phoneNumber
  // never create a duplicate user.
  async whatsappLink(dto: WhatsappLinkDto) {
    let user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phoneNumber: dto.phoneNumber,
          fullName: dto.displayName?.trim() || 'WhatsApp User',
          authProvider: 'WHATSAPP',
        },
      });
    }

    const { passwordHash: _, ...safeUser } = user;
    const tokens = this.signTokens(user.id, user.email);
    return { ...tokens, user: safeUser };
  }

  // Verifies a Supabase-issued access token (the bridge for Google OAuth —
  // see SupabaseService), then finds or creates the matching User and issues
  // our own standard tokens. Lookup order is googleId first, then email, so
  // a user who previously registered with email/password and later signs in
  // with Google on the same address gets linked onto ONE User row instead of
  // creating a duplicate.
  async googleLogin(accessToken: string) {
    const profile = await this.supabase.verifyToken(accessToken);
    const googleId = profile.id;
    const email = profile.email;
    const fullName = profile.user_metadata.full_name?.trim() || 'Google User';
    const avatarUrl = profile.user_metadata.avatar_url ?? null;

    let user = await this.prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({ where: { email } });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId, avatarUrl, authProvider: 'GOOGLE' },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            googleId,
            email,
            fullName,
            avatarUrl,
            authProvider: 'GOOGLE',
            plan: 'FREE',
          },
        });
      }
    }

    const { passwordHash: _, ...safeUser } = user;
    const tokens = this.signTokens(user.id, user.email);
    return { ...tokens, user: safeUser };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<{ sub: string; email: string | null }>(
        refreshToken,
        { secret: process.env.JWT_REFRESH_SECRET },
      );

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) throw new UnauthorizedException();

      const accessToken = this.jwt.sign(
        { sub: payload.sub, email: payload.email },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: '15m',
        },
      );
      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private signTokens(userId: string, email: string | null) {
    const payload = { sub: userId, email };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
