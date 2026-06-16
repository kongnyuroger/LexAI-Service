import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Permissive, international-friendly (E.164-ish): optional leading '+',
// then 8-15 digits with no leading zero. Exact validation rules can be
// tightened later once real-world WhatsApp number formats are observed.
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

export class WhatsappLinkDto {
  @ApiProperty({
    example: '+237670000000',
    description: 'Phone number in E.164-ish format (digits, optional leading +).',
  })
  @IsString()
  @Matches(PHONE_REGEX, {
    message: 'phoneNumber must be a valid international phone number (e.g. +237670000000)',
  })
  phoneNumber: string;

  @ApiProperty({
    example: 'Alice N.',
    required: false,
    maxLength: 100,
    description: 'Used as the new user\'s display name on first contact. Ignored for existing users.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}
