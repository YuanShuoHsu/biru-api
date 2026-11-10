import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class MenuItemRecipeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: LocalizedTextDto })
  name: LocalizedText;

  @ApiProperty()
  recipeYield: number;

  @ApiPropertyOptional({ description: '任一材料缺單價時為 null' })
  cost?: number | null;
}
