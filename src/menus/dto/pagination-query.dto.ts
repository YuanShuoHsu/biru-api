import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const STRING_FILTER_FIELDS = ['name', 'description'] as const;
export const DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const ALL_FILTER_FIELDS = [
  ...STRING_FILTER_FIELDS,
  ...DATE_FILTER_FIELDS,
] as const;

export const STRING_FILTER_OPERATORS = [
  'contains',
  'doesNotContain',
  'equals',
  'doesNotEqual',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'isAnyOf',
] as const;
export const DATE_FILTER_OPERATORS = [
  'is',
  'not',
  'after',
  'onOrAfter',
  'before',
  'onOrBefore',
  'isEmpty',
  'isNotEmpty',
] as const;
export const ALL_FILTER_OPERATORS = [
  'contains',
  'doesNotContain',
  'equals',
  'doesNotEqual',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'isAnyOf',
  'is',
  'not',
  'after',
  'onOrAfter',
  'before',
  'onOrBefore',
] as const;

export type StringFilterField = (typeof STRING_FILTER_FIELDS)[number];
export type DateFilterField = (typeof DATE_FILTER_FIELDS)[number];
export type FilterField = (typeof ALL_FILTER_FIELDS)[number];
export type StringFilterOperator = (typeof STRING_FILTER_OPERATORS)[number];
export type DateFilterOperator = (typeof DATE_FILTER_OPERATORS)[number];
export type FilterOperator = (typeof ALL_FILTER_OPERATORS)[number];

export const SEARCH_FIELDS = ['name', 'description'] as const;
export const SEARCH_OPERATORS = ['contains', 'startsWith', 'endsWith'] as const;

export const SORT_FIELDS = [
  'name',
  'description',
  'createdAt',
  'updatedAt',
] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

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

  @IsOptional()
  @IsIn(ALL_FILTER_FIELDS)
  filterField?: FilterField;

  @IsOptional()
  @IsIn(ALL_FILTER_OPERATORS)
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

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: SortField;

  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;

  @IsOptional()
  @IsString()
  timezone?: string;
}
