import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsNotEmpty,
} from 'class-validator';
import { trim } from '../../common/utils/trim.js';

export class CreateSupplierDto {
  @ApiProperty({ example: '全國食材廣場' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telephone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description:
      '由這家供應的食材；一個食材只屬於一家供應商，選入原本屬於別家的食材會改綁到這家',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ingredientIds?: string[];
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto, {
  skipNullProperties: false,
}) {}
