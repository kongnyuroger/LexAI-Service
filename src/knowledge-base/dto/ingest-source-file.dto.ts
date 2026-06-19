import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IngestSourceFileDto {
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
}
