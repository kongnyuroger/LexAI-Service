import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  id: string;
}

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me/usage')
  @ApiOperation({ summary: 'Get monthly analysis usage for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Returns plan, used count, limit (null = unlimited), remaining, and reset date.',
  })
  getUsage(@CurrentUser() user: AuthUser) {
    return this.users.getMonthlyUsage(user.id);
  }
}
