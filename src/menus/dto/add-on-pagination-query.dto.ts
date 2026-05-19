import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const ADD_ON_STRING_FILTER_FIELDS = [
  'addOnMenuSectionName',
  'addOnMenuItemName',
] as const;
export const ADD_ON_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const ADD_ON_ALL_FILTER_FIELDS = [
  ...ADD_ON_STRING_FILTER_FIELDS,
  ...ADD_ON_DATE_FILTER_FIELDS,
] as const;

export const ADD_ON_ALL_FILTER_OPERATORS = [
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

export const ADD_ON_SORT_FIELDS = [
  'addOnMenuSectionName',
  'addOnMenuItemName',
  'createdAt',
  'updatedAt',
] as const;
export const ADD_ON_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type AddOnFilterField = (typeof ADD_ON_ALL_FILTER_FIELDS)[number];
export type AddOnFilterOperator = (typeof ADD_ON_ALL_FILTER_OPERATORS)[number];
export type AddOnSortField = (typeof ADD_ON_SORT_FIELDS)[number];
export type AddOnSortDirection = (typeof ADD_ON_SORT_DIRECTIONS)[number];

export class AddOnPaginationQueryDto {
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
  @IsIn(ADD_ON_ALL_FILTER_FIELDS)
  filterField?: AddOnFilterField;

  @IsOptional()
  @IsIn(ADD_ON_ALL_FILTER_OPERATORS)
  filterOperator?: AddOnFilterOperator;

  @IsOptional()
  @IsString()
  filterValue?: string;

  @IsOptional()
  @IsString()
  quickFilterValue?: string;

  @IsOptional()
  @IsIn(ADD_ON_SORT_FIELDS)
  sortBy?: AddOnSortField;

  @IsOptional()
  @IsIn(ADD_ON_SORT_DIRECTIONS)
  sortDirection?: AddOnSortDirection;

  @IsOptional()
  @IsString()
  timezone?: string;
}
