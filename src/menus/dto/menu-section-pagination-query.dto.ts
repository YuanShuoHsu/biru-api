import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const MENU_SECTION_STRING_FILTER_FIELDS = [
  'name',
  'description',
] as const;
export const MENU_SECTION_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
export const MENU_SECTION_ALL_FILTER_FIELDS = [
  ...MENU_SECTION_STRING_FILTER_FIELDS,
  ...MENU_SECTION_DATE_FILTER_FIELDS,
] as const;

export const MENU_SECTION_SEARCH_FIELDS = ['name', 'description'] as const;
export const MENU_SECTION_SEARCH_OPERATORS = [
  'contains',
  'startsWith',
  'endsWith',
] as const;

export const MENU_SECTION_SORT_FIELDS = MENU_SECTION_ALL_FILTER_FIELDS;

export type MenuSectionFilterField =
  (typeof MENU_SECTION_ALL_FILTER_FIELDS)[number];
export type MenuSectionSortField = (typeof MENU_SECTION_SORT_FIELDS)[number];

export class MenuSectionPaginationQueryDto {
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
    enum: MENU_SECTION_ALL_FILTER_FIELDS,
    enumName: 'MenuSectionFilterField',
  })
  @IsOptional()
  @IsIn(MENU_SECTION_ALL_FILTER_FIELDS)
  filterField?: MenuSectionFilterField;

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

  @IsOptional()
  @IsIn(MENU_SECTION_SEARCH_FIELDS)
  searchField?: (typeof MENU_SECTION_SEARCH_FIELDS)[number];

  @IsOptional()
  @IsIn(MENU_SECTION_SEARCH_OPERATORS)
  searchOperator?: (typeof MENU_SECTION_SEARCH_OPERATORS)[number];

  @IsOptional()
  @IsString()
  searchValue?: string;

  @ApiPropertyOptional({
    enum: MENU_SECTION_SORT_FIELDS,
    enumName: 'MenuSectionSortField',
  })
  @IsOptional()
  @IsIn(MENU_SECTION_SORT_FIELDS)
  sortBy?: MenuSectionSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
