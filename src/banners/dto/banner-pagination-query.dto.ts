import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const BANNER_ENUM_FILTER_FIELDS = ['isActive'] as const;
export const BANNER_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const BANNER_NUMBER_FILTER_FIELDS = ['sortOrder'] as const;
export const BANNER_ALL_FILTER_FIELDS = [
  ...BANNER_ENUM_FILTER_FIELDS,
  ...BANNER_DATE_FILTER_FIELDS,
  ...BANNER_NUMBER_FILTER_FIELDS,
] as const;

export type BannerFilterField = (typeof BANNER_ALL_FILTER_FIELDS)[number];

export const BANNER_SORT_FIELDS = [
  'sortOrder',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;

export type BannerSortField = (typeof BANNER_SORT_FIELDS)[number];

export class BannerPaginationQueryDto {
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
    enum: BANNER_ALL_FILTER_FIELDS,
    enumName: 'BannerFilterField',
  })
  @IsOptional()
  @IsIn(BANNER_ALL_FILTER_FIELDS)
  filterField?: BannerFilterField;

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
    enum: BANNER_SORT_FIELDS,
    enumName: 'BannerSortField',
  })
  @IsOptional()
  @IsIn(BANNER_SORT_FIELDS)
  sortBy?: BannerSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
