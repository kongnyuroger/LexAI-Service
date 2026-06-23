import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true, example: 'alice@example.cm' })
  email: string | null;

  @ApiProperty({ nullable: true, example: '+237670000000' })
  phoneNumber: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Google profile picture URL. Only set for Google-linked accounts.',
  })
  avatarUrl: string | null;

  @ApiProperty({ enum: ['EMAIL', 'WHATSAPP', 'GOOGLE'] })
  authProvider: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ enum: ['FREE', 'PREMIUM'] })
  plan: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
