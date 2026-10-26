import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';

export class MenuItemRecipeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ ...LOCALIZED_TEXT_SCHEMA })
  name: LocalizedText;

  @ApiProperty()
  recipeYield: number;

  @ApiPropertyOptional({ description: '任一材料缺單價時為 null' })
  cost?: number | null;
}
