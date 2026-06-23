import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { WhatsappLinkDto } from './dto/whatsapp-link.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ServiceAuthGuard } from './guards/service-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User created. Returns access and refresh tokens.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive JWT tokens' })
  @ApiResponse({ status: 200, description: 'Returns access and refresh tokens.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login or register via Supabase-bridged Google OAuth',
    description:
      'Verifies the Supabase session access token (obtained by the web app after the ' +
      'Google OAuth redirect), then finds or creates the matching user and issues our ' +
      'standard access/refresh tokens. A user who previously registered with email/' +
      'password and signs in with Google using the same email is linked onto the same ' +
      'account rather than creating a duplicate.',
  })
  @ApiResponse({ status: 200, description: 'Returns access and refresh tokens.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired Supabase access token.' })
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.auth.googleLogin(dto.accessToken);
  }

  @Post('whatsapp-link')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceAuthGuard)
  @ApiHeader({
    name: 'X-Service-Key',
    description: 'Shared secret for trusted internal callers (SERVICE_API_KEY).',
    required: true,
  })
  @ApiOperation({
    summary: '[Internal/service-only] Find or create a user by phone number and issue tokens',
    description:
      'Not for public or frontend use — callable only by trusted internal services ' +
      '(e.g. lexai-whatsapp-bot) presenting a valid X-Service-Key header. Idempotent: ' +
      'repeated calls for the same phoneNumber return a fresh token for the same user, never a duplicate.',
  })
  @ApiResponse({ status: 200, description: 'Returns access and refresh tokens for the (possibly newly created) user.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid X-Service-Key header.' })
  whatsappLink(@Body() dto: WhatsappLinkDto) {
    return this.auth.whatsappLink(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  @ApiResponse({ status: 200, description: 'Returns a new access token.' })
  @ApiResponse({ status: 401, description: 'Refresh token is invalid or expired.' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the user object (without passwordHash). email is null for ' +
      'WhatsApp-linked users that have not also registered with an email. ' +
      'avatarUrl is set for Google-linked accounts, null otherwise.',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token.' })
  me(@CurrentUser() user: Express.User) {
    return user;
  }
}
