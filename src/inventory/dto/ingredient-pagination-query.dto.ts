import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const INGREDIENT_STRING_FILTER_FIELDS = ['name', 'brand'] as const;
export const INGREDIENT_ENUM_FILTER_FIELDS = ['unitCode'] as const;
export const INGREDIENT_NUMBER_FILTER_FIELDS = [
  'inventoryLevel',
  'lowStockThreshold',
] as const;
export const INGREDIENT_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
export const INGREDIENT_ALL_FILTER_FIELDS = [
  ...INGREDIENT_STRING_FILTER_FIELDS,
  ...INGREDIENT_ENUM_FILTER_FIELDS,
  ...INGREDIENT_NUMBER_FILTER_FIELDS,
  ...INGREDIENT_DATE_FILTER_FIELDS,
] as const;

export type IngredientFilterField =
  (typeof INGREDIENT_ALL_FILTER_FIELDS)[number];

export const INGREDIENT_SORT_FIELDS = INGREDIENT_ALL_FILTER_FIELDS;

export type IngredientSortField = (typeof INGREDIENT_SORT_FIELDS)[number];

export class IngredientPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: INGREDIENT_ALL_FILTER_FIELDS,
    enumName: 'IngredientFilterField',
  })
  @IsOptional()
  @IsIn(INGREDIENT_ALL_FILTER_FIELDS)
  filterField?: IngredientFilterField;

  @ApiPropertyOptional({
    enum: INGREDIENT_SORT_FIELDS,
    enumName: 'IngredientSortField',
  })
  @IsOptional()
  @IsIn(INGREDIENT_SORT_FIELDS)
  sortBy?: IngredientSortField;
}
