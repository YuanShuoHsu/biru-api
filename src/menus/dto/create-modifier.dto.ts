import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsArray,
  IsEnum,
  IsNumberString,
  IsObject,
  IsOptional,
} from 'class-validator';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

export class CreateModifierDto {
  @ApiProperty({
    type: LocalizedTextDto,
    description: '選項名稱，如「半糖」「珍珠」',
    example: { 'zh-TW': '半糖', en: 'Half Sugar' },
  })
  @IsObject()
  displayName: LocalizedText;

  @ApiPropertyOptional({
    description: '加價金額；省略代表不影響價格',
    example: '10.00',
  })
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
    description: '可販售的點餐模式；省略代表四種全開',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(orderModeEnum.enumValues, { each: true })
  availableModes?: OrderMode[];
}
