import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const STRING_FILTER_FIELDS = ['name', 'description'] as const;
export const DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const ALL_FILTER_FIELDS = [
  ...STRING_FILTER_FIELDS,
  ...DATE_FILTER_FIELDS,
] as const;

export type StringFilterField = (typeof STRING_FILTER_FIELDS)[number];
export type DateFilterField = (typeof DATE_FILTER_FIELDS)[number];
export type FilterField = (typeof ALL_FILTER_FIELDS)[number];

export const SEARCH_FIELDS = ['name', 'description'] as const;
export const SEARCH_OPERATORS = ['contains', 'startsWith', 'endsWith'] as const;

export const SORT_FIELDS = [
  'name',
  'description',
  'createdAt',
  'updatedAt',
] as const;

export type SortField = (typeof SORT_FIELDS)[number];

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ enum: ALL_FILTER_FIELDS, enumName: 'MenuFilterField' })
  @IsOptional()
  @IsIn(ALL_FILTER_FIELDS)
  filterField?: FilterField;

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
  @IsIn(SEARCH_FIELDS)
  searchField?: (typeof SEARCH_FIELDS)[number];

  @IsOptional()
  @IsIn(SEARCH_OPERATORS)
  searchOperator?: (typeof SEARCH_OPERATORS)[number];

  @IsOptional()
  @IsString()
  searchValue?: string;

  @ApiPropertyOptional({ enum: SORT_FIELDS, enumName: 'MenuSortField' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: SortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;

  @IsOptional()
  @IsString()
  timezone?: string;
}
