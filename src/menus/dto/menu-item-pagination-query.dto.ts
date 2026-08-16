import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const MENU_ITEM_STRING_FILTER_FIELDS = [
  'name',
  'description',
  'priceCurrency',
] as const;
export const MENU_ITEM_NUMBER_FILTER_FIELDS = [
  'price',
  'inventoryLevel',
  'deliveryLeadTime',
  'priceSpecification',
] as const;
export const MENU_ITEM_ENUM_FILTER_FIELDS = ['availability'] as const;
export const MENU_ITEM_ARRAY_ENUM_FILTER_FIELDS = ['availableModes'] as const;
export const MENU_ITEM_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const MENU_ITEM_PLAIN_DATE_FILTER_FIELDS = [
  'priceSpecificationValidFrom',
  'priceSpecificationValidThrough',
] as const;
export const MENU_ITEM_ALL_FILTER_FIELDS = [
  ...MENU_ITEM_STRING_FILTER_FIELDS,
  ...MENU_ITEM_NUMBER_FILTER_FIELDS,
  ...MENU_ITEM_ENUM_FILTER_FIELDS,
  ...MENU_ITEM_ARRAY_ENUM_FILTER_FIELDS,
  ...MENU_ITEM_DATE_FILTER_FIELDS,
  ...MENU_ITEM_PLAIN_DATE_FILTER_FIELDS,
] as const;

// availableModes 是陣列,快速搜尋走 customConditions 的 overlap 判定
export const MENU_ITEM_QUICK_FILTER_ENUM_FIELDS = ['availability'] as const;

export const MENU_ITEM_SEARCH_FIELDS = ['name', 'description'] as const;
export const MENU_ITEM_SEARCH_OPERATORS = [
  'contains',
  'startsWith',
  'endsWith',
] as const;

// availableModes 是陣列,排序沒有可解釋的順序,不開放
export const MENU_ITEM_SORT_FIELDS = [
  ...MENU_ITEM_STRING_FILTER_FIELDS,
  ...MENU_ITEM_NUMBER_FILTER_FIELDS,
  ...MENU_ITEM_ENUM_FILTER_FIELDS,
  ...MENU_ITEM_DATE_FILTER_FIELDS,
  ...MENU_ITEM_PLAIN_DATE_FILTER_FIELDS,
] as const;

export type MenuItemFilterField = (typeof MENU_ITEM_ALL_FILTER_FIELDS)[number];
export type MenuItemSortField = (typeof MENU_ITEM_SORT_FIELDS)[number];

export class MenuItemPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    enum: MENU_ITEM_ALL_FILTER_FIELDS,
    enumName: 'MenuItemFilterField',
  })
  @IsOptional()
  @IsIn(MENU_ITEM_ALL_FILTER_FIELDS)
  filterField?: MenuItemFilterField;

  @ApiPropertyOptional({
    enum: FILTER_OPERATORS,
    enumName: 'FilterOperator',
  })
  @IsOptional()
  @IsIn(FILTER_OPERATORS)
  filterOperator?: FilterOperator;

  @IsOptional()
  @IsString()
  filterValue?: string;

  @IsOptional()
  @IsString()
  quickFilterValue?: string;

  @ApiPropertyOptional({
    description: '快速搜尋命中的列舉條件,格式為 field:value1,value2',
    isArray: true,
    type: String,
  })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : [value],
  )
  @IsString({ each: true })
  quickFilterEnums?: string[];

  @IsOptional()
  @IsIn(MENU_ITEM_SEARCH_FIELDS)
  searchField?: (typeof MENU_ITEM_SEARCH_FIELDS)[number];

  @IsOptional()
  @IsIn(MENU_ITEM_SEARCH_OPERATORS)
  searchOperator?: (typeof MENU_ITEM_SEARCH_OPERATORS)[number];

  @IsOptional()
  @IsString()
  searchValue?: string;

  @ApiPropertyOptional({
    enum: MENU_ITEM_SORT_FIELDS,
    enumName: 'MenuItemSortField',
  })
  @IsOptional()
  @IsIn(MENU_ITEM_SORT_FIELDS)
  sortBy?: MenuItemSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
