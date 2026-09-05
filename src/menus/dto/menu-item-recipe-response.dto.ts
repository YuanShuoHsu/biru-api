import { ApiProperty } from '@nestjs/swagger';

import type { LocalizedText } from 'src/db/schema/enums';

export class MenuItemRecipeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: LocalizedText;

  @ApiProperty()
  recipeYield: number;

  @ApiProperty()
  cost: number;
}
