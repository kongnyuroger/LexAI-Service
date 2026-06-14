import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check — confirms the server is running' })
  @ApiResponse({ status: 200, description: 'Server is healthy.' })
  check() {
    return { status: 'ok' };
  }
}
