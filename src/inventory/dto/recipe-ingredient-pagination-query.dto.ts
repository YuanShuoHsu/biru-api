import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const RECIPE_INGREDIENT_STRING_FILTER_FIELDS = [
  'ingredientName',
] as const;
export const RECIPE_INGREDIENT_NUMBER_FILTER_FIELDS = [
  'requiredQuantity',
] as const;
export const RECIPE_INGREDIENT_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
export const RECIPE_INGREDIENT_ALL_FILTER_FIELDS = [
  ...RECIPE_INGREDIENT_STRING_FILTER_FIELDS,
  ...RECIPE_INGREDIENT_NUMBER_FILTER_FIELDS,
  ...RECIPE_INGREDIENT_DATE_FILTER_FIELDS,
] as const;

export type RecipeIngredientFilterField =
  (typeof RECIPE_INGREDIENT_ALL_FILTER_FIELDS)[number];

export const RECIPE_INGREDIENT_SORT_FIELDS =
  RECIPE_INGREDIENT_ALL_FILTER_FIELDS;

export type RecipeIngredientSortField =
  (typeof RECIPE_INGREDIENT_SORT_FIELDS)[number];

export class RecipeIngredientPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RECIPE_INGREDIENT_ALL_FILTER_FIELDS,
    enumName: 'RecipeIngredientFilterField',
  })
  @IsOptional()
  @IsIn(RECIPE_INGREDIENT_ALL_FILTER_FIELDS)
  filterField?: RecipeIngredientFilterField;

  @ApiPropertyOptional({
    enum: RECIPE_INGREDIENT_SORT_FIELDS,
    enumName: 'RecipeIngredientSortField',
  })
  @IsOptional()
  @IsIn(RECIPE_INGREDIENT_SORT_FIELDS)
  sortBy?: RecipeIngredientSortField;
}
