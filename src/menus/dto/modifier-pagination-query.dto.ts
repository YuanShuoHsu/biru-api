import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const MODIFIER_STRING_FILTER_FIELDS = ['displayName'] as const;
export const MODIFIER_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const MODIFIER_ALL_FILTER_FIELDS = [
  ...MODIFIER_STRING_FILTER_FIELDS,
  ...MODIFIER_DATE_FILTER_FIELDS,
] as const;

export const MODIFIER_ALL_FILTER_OPERATORS = [
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

export const MODIFIER_SORT_FIELDS = [
  'displayName',
  'createdAt',
  'updatedAt',
] as const;
export const MODIFIER_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type ModifierFilterField = (typeof MODIFIER_ALL_FILTER_FIELDS)[number];
export type ModifierFilterOperator =
  (typeof MODIFIER_ALL_FILTER_OPERATORS)[number];
export type ModifierSortField = (typeof MODIFIER_SORT_FIELDS)[number];
export type ModifierSortDirection = (typeof MODIFIER_SORT_DIRECTIONS)[number];

export class ModifierPaginationQueryDto {
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
  @IsIn(MODIFIER_ALL_FILTER_FIELDS)
  filterField?: ModifierFilterField;

  @IsOptional()
  @IsIn(MODIFIER_ALL_FILTER_OPERATORS)
  filterOperator?: ModifierFilterOperator;

  @IsOptional()
  @IsString()
  filterValue?: string;

  @IsOptional()
  @IsString()
  quickFilterValue?: string;

  @IsOptional()
  @IsIn(MODIFIER_SORT_FIELDS)
  sortBy?: ModifierSortField;

  @IsOptional()
  @IsIn(MODIFIER_SORT_DIRECTIONS)
  sortDirection?: ModifierSortDirection;

  @IsOptional()
  @IsString()
  timezone?: string;
}
