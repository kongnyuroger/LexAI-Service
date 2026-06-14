import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token returned from POST /auth/login' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
