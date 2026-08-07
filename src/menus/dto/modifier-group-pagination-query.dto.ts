import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const MODIFIER_GROUP_STRING_FILTER_FIELDS = ['displayName'] as const;
export const MODIFIER_GROUP_NUMBER_FILTER_FIELDS = [
  'minSelectionCount',
  'maxSelectionCount',
] as const;
export const MODIFIER_GROUP_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
export const MODIFIER_GROUP_ALL_FILTER_FIELDS = [
  ...MODIFIER_GROUP_STRING_FILTER_FIELDS,
  ...MODIFIER_GROUP_NUMBER_FILTER_FIELDS,
  ...MODIFIER_GROUP_DATE_FILTER_FIELDS,
] as const;

export const MODIFIER_GROUP_SORT_FIELDS = MODIFIER_GROUP_ALL_FILTER_FIELDS;

export type ModifierGroupFilterField =
  (typeof MODIFIER_GROUP_ALL_FILTER_FIELDS)[number];
export type ModifierGroupSortField =
  (typeof MODIFIER_GROUP_SORT_FIELDS)[number];

export class ModifierGroupPaginationQueryDto {
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

  @ApiPropertyOptional({
    enum: MODIFIER_GROUP_ALL_FILTER_FIELDS,
    enumName: 'ModifierGroupFilterField',
  })
  @IsOptional()
  @IsIn(MODIFIER_GROUP_ALL_FILTER_FIELDS)
  filterField?: ModifierGroupFilterField;

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
    enum: MODIFIER_GROUP_SORT_FIELDS,
    enumName: 'ModifierGroupSortField',
  })
  @IsOptional()
  @IsIn(MODIFIER_GROUP_SORT_FIELDS)
  sortBy?: ModifierGroupSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
