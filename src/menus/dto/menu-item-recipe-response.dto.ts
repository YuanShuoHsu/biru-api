import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from 'src/db/schema/enums';

export class MenuItemRecipeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: LocalizedText;

  @ApiProperty()
  recipeYield: number;

  @ApiPropertyOptional({ description: '任一材料缺單價時為 null' })
  cost: number | null;
}
