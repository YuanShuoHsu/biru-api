import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import {
  BASE_UNIT_CODES,
  UNIT_FACTORS,
  type BaseUnitCode,
} from '../../common/constants/units.js';
import {
  IsLocalizedText,
  IsCompleteLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import type { UnitCode } from '../../db/schema/inventory.js';

export const PURCHASED_FIELDS = [
  'price',
  'eligibleQuantity',
  'eligibleQuantityUnitCode',
  'supplierId',
] as const;

@ValidatorConstraint({ name: 'isWithoutPurchasedFields' })
class IsWithoutPurchasedFields implements ValidatorConstraintInterface {
  validate(_: unknown, { object }: ValidationArguments): boolean {
    const dto = object as CreateIngredientDto;

    return PURCHASED_FIELDS.every((field) => dto[field] == null);
  }

  defaultMessage(): string {
    return `recipeId 不能與 ${PURCHASED_FIELDS.join(', ')} 同時帶`;
  }
}

export class CreateIngredientDto {
  @ApiProperty({
    type: LocalizedTextDto,
    example: { 'zh-TW': '抹茶粉', en: 'Matcha Powder' },
  })
  @IsLocalizedText()
  @IsCompleteLocalizedText()
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
  @Matches(/^\d{1,9}(\.\d{1,3})?$/)
  @IsNumberString()
  lowStockThreshold?: string | null;

  @ApiPropertyOptional({
    description:
      '自製半成品的來源食譜；設定後單價由食譜材料成本與產量推算，不能再帶 price、eligibleQuantity、eligibleQuantityUnitCode、supplierId',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Validate(IsWithoutPurchasedFields)
  recipeId?: string | null;

  @ApiPropertyOptional({
    example: '950.00',
    description: '一個包裝的價錢；未帶 recipeId 時必填',
  })
  @ValidateIf((dto: CreateIngredientDto) => !dto.recipeId)
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  @IsNumberString()
  price?: string;

  @ApiPropertyOptional({
    example: '100.000',
    description: '一個包裝的量；未帶 recipeId 時必填',
  })
  @ValidateIf((dto: CreateIngredientDto) => !dto.recipeId)
  @Matches(/^(?!0+(\.0+)?$)\d{1,9}(\.\d{1,3})?$/)
  @IsNumberString()
  eligibleQuantity?: string;

  @ApiPropertyOptional({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
    description:
      'eligibleQuantity 的單位，需與 unitCode 同維度；未帶 recipeId 時必填',
  })
  @ValidateIf((dto: CreateIngredientDto) => !dto.recipeId)
  @IsIn(Object.keys(UNIT_FACTORS))
  eligibleQuantityUnitCode?: UnitCode;

  @ApiPropertyOptional({ description: '採購連結' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      '不限量的食材不扣庫存、不判斷售完、不發低庫存警示；成本照算。庫存與 lowStockThreshold 會保留，改回追蹤後沿用',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  unlimitedStock?: boolean;

  @ApiPropertyOptional({
    example: '500.000',
    description: '開帳數量；系統會一併寫入盤點帳本',
  })
  @IsOptional()
  @Matches(/^\d{1,9}(\.\d{1,3})?$/)
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

export class UpdateIngredientDto extends PartialType(CreateIngredientDto, {
  skipNullProperties: false,
}) {}
