import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ApiLocalizedTextProperty } from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class MenuItemRecipeResponseDto {
  @ApiProperty()
  id: string;

  @ApiLocalizedTextProperty()
  name: LocalizedText;

  @ApiProperty()
  recipeYield: number;

  @ApiPropertyOptional({ description: '任一材料缺單價時為 null' })
  cost?: number | null;
}
