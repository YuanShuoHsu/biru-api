import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { UNIT_FACTORS } from 'src/common/constants/units';
import type { UnitCode } from 'src/db/schema/inventory';

const UNIT_CODES = Object.keys(UNIT_FACTORS) as UnitCode[];

export class CreateIngredientOfferDto {
  @ApiProperty({ example: '950.00' })
  @IsNumberString()
  price: string;

  @ApiPropertyOptional({ example: 'TWD' })
  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @ApiProperty({ example: '100.000', description: '包裝容量' })
  @IsNumberString()
  eligibleQuantity: string;

  @ApiProperty({ enum: UNIT_CODES, enumName: 'UnitCode' })
  @IsIn(UNIT_CODES)
  eligibleQuantityUnitCode: UnitCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @ApiPropertyOptional({ description: '商品連結' })
  @IsOptional()
  @IsString()
  url?: string | null;

  @ApiPropertyOptional({ description: '未帶時排在最後；成本取排序第一筆' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateIngredientOfferDto extends PartialType(
  CreateIngredientOfferDto,
) {}
