import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsArray, IsEnum, IsNumberString, IsOptional } from 'class-validator';
import {
  IsLocalizedText,
  IsCompleteLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

export class UpdateModifierDto {
  @ApiPropertyOptional({ type: LocalizedTextDto, description: '選項名稱' })
  @IsOptional()
  @IsLocalizedText()
  @IsCompleteLocalizedText()
  displayName?: LocalizedText;

  @ApiPropertyOptional({
    description: '加價金額',
    example: '10.00',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsNumberString()
  priceAdjustment?: string | null;

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
