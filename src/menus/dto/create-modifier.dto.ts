import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsEnum, IsNumberString, IsObject, IsOptional } from 'class-validator';

import type { LocalizedText } from 'src/db/schema/enums';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from 'src/db/schema/menus';

export class CreateModifierDto {
  @ApiProperty({
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
}
