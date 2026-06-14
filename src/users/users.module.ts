import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsageLimitGuard } from './guards/usage-limit.guard';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsageLimitGuard],
  exports: [UsersService, UsageLimitGuard],
})
export class UsersModule {}
