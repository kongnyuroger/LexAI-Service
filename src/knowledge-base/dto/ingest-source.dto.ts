import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IngestSourceDto {
  @ApiProperty({ example: 'Cameroonian Labour Code', description: 'Human-readable title of the legal source.' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Cameroon', description: 'Jurisdiction this source applies to.' })
  @IsString()
  @IsNotEmpty()
  jurisdiction: string;

  @ApiProperty({ example: 'statute', description: 'Type of source (statute, decree, regulation, case-law, etc.).' })
  @IsString()
  @IsNotEmpty()
  sourceType: string;

  @ApiProperty({
    description: 'Full text of the legal source. Will be chunked and embedded for RAG.',
    minLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(50)
  content: string;
}
