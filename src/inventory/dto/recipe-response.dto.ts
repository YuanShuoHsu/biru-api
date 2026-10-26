import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UNIT_FACTORS } from '../../common/constants/units.js';
import type { LocalizedText } from '../../db/schema/enums.js';

import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';
import type { UnitCode } from '../../db/schema/inventory.js';

export class RecipeIngredientResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() recipeId: string;
  @ApiProperty() ingredientId: string;
  @ApiProperty({ ...LOCALIZED_TEXT_SCHEMA }) ingredientName: LocalizedText;
  @ApiProperty({ enum: Object.keys(UNIT_FACTORS), enumName: 'UnitCode' })
  unitCode: UnitCode;
  @ApiProperty() requiredQuantity: string;
  @ApiPropertyOptional({ description: '無 purchasing 權限時不回傳' })
  unitPrice?: number | null;
  @ApiPropertyOptional({
    description: '用量 × 單價；無 purchasing 權限時不回傳',
  })
  cost?: number | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class RecipeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiPropertyOptional() menuItemId: string | null;
  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  menuItemName: LocalizedText | null;
  @ApiProperty({ ...LOCALIZED_TEXT_SCHEMA }) name: LocalizedText;
  @ApiProperty() recipeYield: number;
  @ApiPropertyOptional({
    type: 'array',
    items: LOCALIZED_TEXT_SCHEMA,
    nullable: true,
  })
  recipeInstructions: LocalizedText[] | null;
  @ApiPropertyOptional({
    description:
      '全部材料成本合計；任一材料缺單價時為 null，無 purchasing 權限時不回傳',
  })
  cost?: number | null;
  @ApiPropertyOptional({ description: '對應品項售價' }) price: number | null;
  @ApiPropertyOptional({ isArray: true, type: RecipeIngredientResponseDto })
  recipeIngredients?: RecipeIngredientResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class MenuItemRecipeDetailResponseDto {
  @ApiProperty({ nullable: true, type: RecipeResponseDto })
  recipe: RecipeResponseDto | null;
}
