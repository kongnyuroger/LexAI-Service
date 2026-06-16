import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({
    description: 'The message to send to the document assistant.',
    example: 'What is the notice period for termination?',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
