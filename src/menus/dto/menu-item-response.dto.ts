import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { NutritionInformation, RestrictedDiet } from 'src/db/schema/menus';

export class MenuItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuId: string | null;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiPropertyOptional({ isArray: true })
  suitableForDiet: RestrictedDiet[] | null;

  @ApiPropertyOptional()
  nutrition: NutritionInformation | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
