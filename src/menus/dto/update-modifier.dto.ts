import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsArray,
  IsEnum,
  IsNumberString,
  IsObject,
  IsOptional,
} from 'class-validator';
import { ApiLocalizedTextPropertyOptional } from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

export class UpdateModifierDto {
  @ApiLocalizedTextPropertyOptional({ description: '選項名稱' })
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
