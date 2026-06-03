import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ItemAvailability } from 'src/db/schema/menus';
import { itemAvailabilityEnum } from 'src/db/schema/menus';

export class ModifierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  modifierGroupId: string;

  @ApiProperty()
  displayName: string;

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
