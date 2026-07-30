import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';
import { languagesEnum, type Language } from 'src/db/schema/enums';

export const COUPON_STRING_FILTER_FIELDS = ['code'] as const;
export const COUPON_ENUM_FILTER_FIELDS = ['scope', 'isActive'] as const;
export const COUPON_DATE_FILTER_FIELDS = ['validFrom', 'createdAt'] as const;
export const COUPON_NUMBER_FILTER_FIELDS = [
  'discountValue',
  'minSubtotal',
  'usedCount',
  'perUserLimit',
  'pointsCost',
] as const;
// 特例欄位:適用店家(陣列、含全部通用語意)與取得管道(三旗標合成),條件於 service 內組裝
export const COUPON_CUSTOM_FILTER_FIELDS = [
  'applicableOrganizationIds',
  'distribution',
] as const;
export const COUPON_ALL_FILTER_FIELDS = [
  ...COUPON_STRING_FILTER_FIELDS,
  ...COUPON_ENUM_FILTER_FIELDS,
  ...COUPON_DATE_FILTER_FIELDS,
  ...COUPON_NUMBER_FILTER_FIELDS,
  ...COUPON_CUSTOM_FILTER_FIELDS,
] as const;

export type CouponFilterField = (typeof COUPON_ALL_FILTER_FIELDS)[number];

export const COUPON_SORT_FIELDS = [
  'code',
  'applicableOrganizationIds',
  'scope',
  'menuSectionIds',
  'menuItemIds',
  'discountValue',
  'minSubtotal',
  'usedCount',
  'perUserLimit',
  'pointsCost',
  'validFrom',
  'distribution',
  'isActive',
  'createdAt',
] as const;

export type CouponSortField = (typeof COUPON_SORT_FIELDS)[number];

export class CouponPaginationQueryDto {
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
    enum: COUPON_ALL_FILTER_FIELDS,
    enumName: 'CouponFilterField',
  })
  @IsOptional()
  @IsIn(COUPON_ALL_FILTER_FIELDS)
  filterField?: CouponFilterField;

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

  // 分類/品項名稱為多語系 jsonb,依此語言解析顯示與排序
  @ApiPropertyOptional({ enum: languagesEnum.enumValues })
  @IsOptional()
  @IsIn(languagesEnum.enumValues)
  lang?: Language;

  @ApiPropertyOptional({
    enum: COUPON_SORT_FIELDS,
    enumName: 'CouponSortField',
  })
  @IsOptional()
  @IsIn(COUPON_SORT_FIELDS)
  sortBy?: CouponSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
