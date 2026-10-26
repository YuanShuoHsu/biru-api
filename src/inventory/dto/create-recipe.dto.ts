import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsArray,
  IsInt,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

import {
  ApiLocalizedTextProperty,
  ApiLocalizedTextPropertyOptional,
} from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateRecipeDto {
  @ApiLocalizedTextProperty({
    example: { 'zh-TW': '抹茶奶酪', en: 'Matcha Panna Cotta' },
  })
  @IsObject()
  name: LocalizedText;

  @ApiPropertyOptional({
    description: '對應的菜單品項，一個品項只能有一份食譜',
  })
  @IsOptional()
  @IsString()
  menuItemId?: string | null;

  @ApiPropertyOptional({ default: 1, description: '份量' })
  @IsOptional()
  @IsInt()
  @Min(1)
  recipeYield?: number;

  @ApiLocalizedTextPropertyOptional({
    isArray: true,
    example: [{ 'zh-TW': '吉利丁片泡冷水軟化，約 5 分鐘。' }],
  })
  @IsOptional()
  @IsArray()
  recipeInstructions?: LocalizedText[];
}

export class UpdateRecipeDto extends PartialType(CreateRecipeDto) {}

export class CreateRecipeIngredientDto {
  @ApiProperty()
  @IsString()
  ingredientId: string;

  @ApiProperty({ example: '4.000', description: '基準單位用量' })
  @Matches(/^\d+(\.\d+)?$/)
  @IsNumberString()
  requiredQuantity: string;

  @ApiPropertyOptional({ description: '未帶時排在最後' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateRecipeIngredientDto extends PartialType(
  CreateRecipeIngredientDto,
) {}
