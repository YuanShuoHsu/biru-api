import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from 'src/db/schema/enums';
import {
  itemAvailabilityEnum,
  servingTemperatureEnum,
  type ItemAvailability,
  type ServingTemperature,
} from 'src/db/schema/menus';
import { orderModeEnum, type OrderMode } from 'src/db/schema/orders';

export class ModifierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  modifierGroupId: string;

  @ApiProperty()
  displayName: LocalizedText;

  @ApiPropertyOptional({ description: '加價金額；null 代表不影響價格' })
  priceAdjustment: string | null;

  @ApiProperty({ description: 'priceAdjustment 的幣別；來自店家設定' })
  priceCurrency: string;

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  availability: ItemAvailability | null;

  @ApiProperty({
    description: '可販售的點餐模式',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  availableModes: OrderMode[];

  @ApiPropertyOptional({
    description: '選項代表的飲品溫度；null 代表與溫度無關',
    enum: servingTemperatureEnum.enumValues,
    enumName: 'ServingTemperature',
  })
  servingTemperature: ServingTemperature | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
