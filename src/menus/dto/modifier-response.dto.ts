import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
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

  @ApiProperty({ type: LocalizedTextDto })
  displayName: LocalizedText;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

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
    description: 'true 代表系統因食材不足而自動售完，補貨後會自動恢復供應',
  })
  autoSoldOut: boolean;

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

export class ModifierListResponseDto {
  @ApiProperty({ type: [ModifierResponseDto] }) data: ModifierResponseDto[];
  @ApiProperty() total: number;
}
