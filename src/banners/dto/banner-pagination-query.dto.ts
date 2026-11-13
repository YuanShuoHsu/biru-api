import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const BANNER_STRING_FILTER_FIELDS = ['alt'] as const;
export const BANNER_ENUM_FILTER_FIELDS = ['isActive'] as const;
export const BANNER_DATE_FILTER_FIELDS = [
  'startsAt',
  'endsAt',
  'createdAt',
  'updatedAt',
] as const;
const BANNER_ALL_FILTER_FIELDS = [
  ...BANNER_STRING_FILTER_FIELDS,
  ...BANNER_ENUM_FILTER_FIELDS,
  ...BANNER_DATE_FILTER_FIELDS,
] as const;

type BannerFilterField = (typeof BANNER_ALL_FILTER_FIELDS)[number];

const BANNER_SORT_FIELDS = [
  'alt',
  'isActive',
  'startsAt',
  'endsAt',
  'createdAt',
  'updatedAt',
] as const;

type BannerSortField = (typeof BANNER_SORT_FIELDS)[number];

export class BannerPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: BANNER_ALL_FILTER_FIELDS,
    enumName: 'BannerFilterField',
  })
  @IsOptional()
  @IsIn(BANNER_ALL_FILTER_FIELDS)
  filterField?: BannerFilterField;

  @ApiPropertyOptional({
    enum: BANNER_SORT_FIELDS,
    enumName: 'BannerSortField',
  })
  @IsOptional()
  @IsIn(BANNER_SORT_FIELDS)
  sortBy?: BannerSortField;
}
