import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import {
  BASE_UNIT_CODES,
  UNIT_FACTORS,
  type BaseUnitCode,
} from '../../common/constants/units.js';
import {
  IsLocalizedText,
  IsRequiredLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import type { UnitCode } from '../../db/schema/inventory.js';

export class CreateIngredientDto {
  @ApiProperty({
    type: LocalizedTextDto,
    example: { 'zh-TW': '抹茶粉', en: 'Matcha Powder' },
  })
  @IsLocalizedText()
  @IsRequiredLocalizedText()
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

  @ApiProperty({ example: '950.00', description: '一個包裝的價錢' })
  @IsNumberString()
  price: string;

  @ApiProperty({ example: '100.000', description: '一個包裝的量' })
  @IsNumberString()
  eligibleQuantity: string;

  @ApiProperty({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
    description: 'eligibleQuantity 的單位，需與 unitCode 同維度',
  })
  @IsIn(Object.keys(UNIT_FACTORS))
  eligibleQuantityUnitCode: UnitCode;

  @ApiPropertyOptional({ description: '採購連結' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({
    example: '500.000',
    description: '開帳數量；系統會一併寫入盤點帳本',
  })
  @IsOptional()
  @IsNumberString()
  inventoryLevel?: string | null;

  @ApiPropertyOptional({
    example: '公克',
    description: 'inventoryLevel 顯示用的單位；不參與 unitCode 的換算',
  })
  @IsOptional()
  @IsString()
  inventoryLevelUnitText?: string | null;

  @ApiPropertyOptional({
    description: 'inventoryLevel 寫入帳本時的異動原因；不會存到 ingredient',
  })
  @IsOptional()
  @IsString()
  transactionNote?: string | null;
}

export class UpdateIngredientDto extends PartialType(CreateIngredientDto) {}
