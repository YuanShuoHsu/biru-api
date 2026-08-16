import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const BANNER_ENUM_FILTER_FIELDS = ['isActive'] as const;
export const BANNER_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const BANNER_ALL_FILTER_FIELDS = [
  ...BANNER_ENUM_FILTER_FIELDS,
  ...BANNER_DATE_FILTER_FIELDS,
] as const;

export type BannerFilterField = (typeof BANNER_ALL_FILTER_FIELDS)[number];

export const BANNER_SORT_FIELDS = [
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
  @Max(100)
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
