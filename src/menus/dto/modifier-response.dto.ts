import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from 'src/db/schema/enums';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from 'src/db/schema/menus';

export class ModifierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  modifierGroupId: string;

  @ApiProperty()
  displayName: LocalizedText;

  @ApiPropertyOptional({ description: '加價金額；null 代表不影響價格' })
  priceAdjustment: string | null;

  @ApiPropertyOptional({ enum: itemAvailabilityEnum.enumValues })
  availability: ItemAvailability | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
