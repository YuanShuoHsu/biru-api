import { ApiPropertyOptional } from '@nestjs/swagger';

import type { NutritionInformation } from 'src/db/schema/menus';

export class NutritionInformationDto implements NutritionInformation {
  @ApiPropertyOptional() calories?: string;
  @ApiPropertyOptional() carbohydrateContent?: string;
  @ApiPropertyOptional() cholesterolContent?: string;
  @ApiPropertyOptional() fatContent?: string;
  @ApiPropertyOptional() fiberContent?: string;
  @ApiPropertyOptional() proteinContent?: string;
  @ApiPropertyOptional() saturatedFatContent?: string;
  @ApiPropertyOptional() servingSize?: string;
  @ApiPropertyOptional() sodiumContent?: string;
  @ApiPropertyOptional() sugarContent?: string;
  @ApiPropertyOptional() transFatContent?: string;
  @ApiPropertyOptional() unsaturatedFatContent?: string;
}
