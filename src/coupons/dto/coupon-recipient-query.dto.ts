import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const COUPON_RECIPIENT_STRING_FILTER_FIELDS = [
  'userEmail',
  'grantedByEmail',
] as const;
export const COUPON_RECIPIENT_ENUM_FILTER_FIELDS = ['source'] as const;
export const COUPON_RECIPIENT_DATE_FILTER_FIELDS = ['createdAt'] as const;
export const COUPON_RECIPIENT_CUSTOM_FILTER_FIELDS = ['usedAt'] as const;
export const COUPON_RECIPIENT_ALL_FILTER_FIELDS = [
  ...COUPON_RECIPIENT_STRING_FILTER_FIELDS,
  ...COUPON_RECIPIENT_ENUM_FILTER_FIELDS,
  ...COUPON_RECIPIENT_DATE_FILTER_FIELDS,
  ...COUPON_RECIPIENT_CUSTOM_FILTER_FIELDS,
] as const;

export type CouponRecipientFilterField =
  (typeof COUPON_RECIPIENT_ALL_FILTER_FIELDS)[number];

export const COUPON_RECIPIENT_SORT_FIELDS = [
  'userEmail',
  'source',
  'grantedByEmail',
  'createdAt',
  'usedAt',
] as const;

export type CouponRecipientSortField =
  (typeof COUPON_RECIPIENT_SORT_FIELDS)[number];

export class CouponRecipientQueryDto {
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
    enum: COUPON_RECIPIENT_ALL_FILTER_FIELDS,
    enumName: 'CouponRecipientFilterField',
  })
  @IsOptional()
  @IsIn(COUPON_RECIPIENT_ALL_FILTER_FIELDS)
  filterField?: CouponRecipientFilterField;

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
    enum: COUPON_RECIPIENT_SORT_FIELDS,
    enumName: 'CouponRecipientSortField',
  })
  @IsOptional()
  @IsIn(COUPON_RECIPIENT_SORT_FIELDS)
  sortBy?: CouponRecipientSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
