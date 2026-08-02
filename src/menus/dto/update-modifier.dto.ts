import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsArray,
  IsEnum,
  IsNumberString,
  IsObject,
  IsOptional,
} from 'class-validator';
import type { LocalizedText } from 'src/db/schema/enums';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from 'src/db/schema/menus';
import { orderModeEnum, type OrderMode } from 'src/db/schema/orders';

export class UpdateModifierDto {
  @ApiPropertyOptional({ description: '選項名稱' })
  @IsOptional()
  @IsObject()
  displayName?: LocalizedText;

  @ApiPropertyOptional({ description: '加價金額', example: '10.00' })
  @IsOptional()
  @IsNumberString()
  priceAdjustment?: string;

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  @IsOptional()
  @IsEnum(itemAvailabilityEnum.enumValues)
  availability?: ItemAvailability;

  @ApiPropertyOptional({
    description: '可販售的點餐模式',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(orderModeEnum.enumValues, { each: true })
  availableModes?: OrderMode[];
}
