import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const ADD_ON_STRING_FILTER_FIELDS = [
  'addOnMenuSectionName',
  'addOnMenuItemName',
] as const;
export const ADD_ON_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const ADD_ON_ALL_FILTER_FIELDS = [
  ...ADD_ON_STRING_FILTER_FIELDS,
  ...ADD_ON_DATE_FILTER_FIELDS,
] as const;

export const ADD_ON_SORT_FIELDS = [
  'addOnMenuSectionName',
  'addOnMenuItemName',
  'createdAt',
  'updatedAt',
] as const;

export type AddOnFilterField = (typeof ADD_ON_ALL_FILTER_FIELDS)[number];
export type AddOnSortField = (typeof ADD_ON_SORT_FIELDS)[number];

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

  @ApiPropertyOptional({
    enum: ADD_ON_ALL_FILTER_FIELDS,
    enumName: 'AddOnFilterField',
  })
  @IsOptional()
  @IsIn(ADD_ON_ALL_FILTER_FIELDS)
  filterField?: AddOnFilterField;

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
    enum: ADD_ON_SORT_FIELDS,
    enumName: 'AddOnSortField',
  })
  @IsOptional()
  @IsIn(ADD_ON_SORT_FIELDS)
  sortBy?: AddOnSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
