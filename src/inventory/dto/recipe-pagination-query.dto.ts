import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const RECIPE_STRING_FILTER_FIELDS = ['name'] as const;
export const RECIPE_NUMBER_FILTER_FIELDS = ['recipeYield'] as const;
export const RECIPE_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const RECIPE_ALL_FILTER_FIELDS = [
  ...RECIPE_STRING_FILTER_FIELDS,
  ...RECIPE_NUMBER_FILTER_FIELDS,
  ...RECIPE_DATE_FILTER_FIELDS,
] as const;

export type RecipeFilterField = (typeof RECIPE_ALL_FILTER_FIELDS)[number];

export const RECIPE_SORT_FIELDS = RECIPE_ALL_FILTER_FIELDS;

export type RecipeSortField = (typeof RECIPE_SORT_FIELDS)[number];

export class RecipePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RECIPE_ALL_FILTER_FIELDS,
    enumName: 'RecipeFilterField',
  })
  @IsOptional()
  @IsIn(RECIPE_ALL_FILTER_FIELDS)
  filterField?: RecipeFilterField;

  @ApiPropertyOptional({
    enum: RECIPE_SORT_FIELDS,
    enumName: 'RecipeSortField',
  })
  @IsOptional()
  @IsIn(RECIPE_SORT_FIELDS)
  sortBy?: RecipeSortField;
}
