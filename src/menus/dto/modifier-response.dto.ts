import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ApiLocalizedTextProperty } from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

export class ModifierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  modifierGroupId: string;

  @ApiLocalizedTextProperty()
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

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
