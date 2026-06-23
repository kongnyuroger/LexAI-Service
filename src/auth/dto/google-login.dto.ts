import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({
    description:
      'The Supabase session access token obtained by the web app after the Google OAuth redirect.',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
