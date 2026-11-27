import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { languagesEnum, type Language } from '../../db/schema/enums.js';

export const COUPON_STRING_FILTER_FIELDS = ['code'] as const;
export const COUPON_ENUM_FILTER_FIELDS = [
  'scope',
  'discountType',
  'isActive',
] as const;
export const COUPON_DATE_FILTER_FIELDS = [
  'validFrom',
  'validThrough',
  'createdAt',
] as const;
export const COUPON_NUMBER_FILTER_FIELDS = [
  'discountValue',
  'minSubtotal',
  'totalLimit',
  'usedCount',
  'perUserLimit',
  'pointsCost',
] as const;
// 特例欄位:適用店家(陣列、含全部通用語意)與取得管道(三旗標合成),條件於 service 內組裝
const COUPON_CUSTOM_FILTER_FIELDS = [
  'applicableOrganizationIds',
  'distribution',
] as const;
const COUPON_ALL_FILTER_FIELDS = [
  ...COUPON_STRING_FILTER_FIELDS,
  ...COUPON_ENUM_FILTER_FIELDS,
  ...COUPON_DATE_FILTER_FIELDS,
  ...COUPON_NUMBER_FILTER_FIELDS,
  ...COUPON_CUSTOM_FILTER_FIELDS,
] as const;

type CouponFilterField = (typeof COUPON_ALL_FILTER_FIELDS)[number];

const COUPON_SORT_FIELDS = [
  'code',
  'applicableOrganizationIds',
  'scope',
  'menuSectionIds',
  'menuItemIds',
  'discountValue',
  'minSubtotal',
  'totalLimit',
  'usedCount',
  'perUserLimit',
  'pointsCost',
  'validFrom',
  'validThrough',
  'distribution',
  'isActive',
  'createdAt',
] as const;

type CouponSortField = (typeof COUPON_SORT_FIELDS)[number];

export class CouponPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: COUPON_ALL_FILTER_FIELDS,
    enumName: 'CouponFilterField',
  })
  @IsOptional()
  @IsIn(COUPON_ALL_FILTER_FIELDS)
  filterField?: CouponFilterField;

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
}
