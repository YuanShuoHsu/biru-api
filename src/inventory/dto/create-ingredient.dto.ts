import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsIn,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { IMAGE_DATA_URL_MAX_LENGTH } from 'src/common/constants/image';
import { BASE_UNIT_CODES, type BaseUnitCode } from 'src/common/constants/units';
import type { LocalizedText } from 'src/db/schema/enums';

export class CreateIngredientDto {
  @ApiProperty({ example: { 'zh-TW': '抹茶粉', en: 'Matcha Powder' } })
  @IsObject()
  name: LocalizedText;

  @ApiPropertyOptional({ example: '森半宇治抹茶粉 PCT-2 茗（無糖）' })
  @IsOptional()
  @IsString()
  brand?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image?: string | null;

  @ApiProperty({ enum: BASE_UNIT_CODES, enumName: 'BaseUnitCode' })
  @IsIn(BASE_UNIT_CODES)
  unitCode: BaseUnitCode;

  @ApiPropertyOptional({ example: '100.000', description: '低於此量顯示警示' })
  @IsOptional()
  @IsNumberString()
  lowStockThreshold?: string | null;
}

export class UpdateIngredientDto extends PartialType(CreateIngredientDto) {}
