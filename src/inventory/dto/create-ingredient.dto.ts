import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';

import {
  IsIn,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

import { IMAGE_DATA_URL_MAX_LENGTH } from 'src/common/constants/image';
import {
  BASE_UNIT_CODES,
  UNIT_FACTORS,
  type BaseUnitCode,
} from 'src/common/constants/units';
import type { LocalizedText } from 'src/db/schema/enums';
import type { UnitCode } from 'src/db/schema/inventory';

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

  @ApiPropertyOptional({ description: '向哪一家採購' })
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @ApiProperty({ enum: BASE_UNIT_CODES, enumName: 'BaseUnitCode' })
  @IsIn(BASE_UNIT_CODES)
  unitCode: BaseUnitCode;

  @ApiPropertyOptional({ example: '100.000', description: '低於此量顯示警示' })
  @IsOptional()
  @IsNumberString()
  lowStockThreshold?: string | null;

  @ApiPropertyOptional({ example: '950.00', description: '一個包裝的價錢' })
  @IsOptional()
  @IsNumberString()
  price?: string | null;

  @ApiPropertyOptional({ example: 'TWD' })
  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @ApiPropertyOptional({ example: '100.000', description: '一個包裝的量' })
  @IsOptional()
  @IsNumberString()
  eligibleQuantity?: string | null;

  @ApiPropertyOptional({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
    description: 'eligibleQuantity 的單位，需與 unitCode 同維度',
  })
  @IsOptional()
  @IsIn(Object.keys(UNIT_FACTORS))
  eligibleQuantityUnitCode?: UnitCode | null;

  @ApiPropertyOptional({ description: '採購連結' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string | null;

  @ApiPropertyOptional({
    example: '500.000',
    description: '開帳數量；系統會一併寫入盤點帳本',
  })
  @IsOptional()
  @IsNumberString()
  inventoryLevel?: string | null;
}

// 建立後的庫存異動一律走盤點帳本，不能靠改食材欄位偷改
export class UpdateIngredientDto extends PartialType(
  OmitType(CreateIngredientDto, ['inventoryLevel'] as const),
) {}
