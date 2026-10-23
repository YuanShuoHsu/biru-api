import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const POINT_TRANSACTION_STRING_FILTER_FIELDS = [
  'userEmail',
  'userName',
  'orderNumber',
] as const;
export const POINT_TRANSACTION_ENUM_FILTER_FIELDS = ['type'] as const;
export const POINT_TRANSACTION_NUMBER_FILTER_FIELDS = [
  'points',
  'remainingPoints',
] as const;
export const POINT_TRANSACTION_DATE_FILTER_FIELDS = [
  'createdAt',
  'expiresAt',
] as const;
export const POINT_TRANSACTION_ALL_FILTER_FIELDS = [
  ...POINT_TRANSACTION_STRING_FILTER_FIELDS,
  ...POINT_TRANSACTION_ENUM_FILTER_FIELDS,
  ...POINT_TRANSACTION_NUMBER_FILTER_FIELDS,
  ...POINT_TRANSACTION_DATE_FILTER_FIELDS,
] as const;

export type PointTransactionFilterField =
  (typeof POINT_TRANSACTION_ALL_FILTER_FIELDS)[number];

export const POINT_TRANSACTION_SORT_FIELDS =
  POINT_TRANSACTION_ALL_FILTER_FIELDS;

export type PointTransactionSortField =
  (typeof POINT_TRANSACTION_SORT_FIELDS)[number];

export class OrganizationPointTransactionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: POINT_TRANSACTION_ALL_FILTER_FIELDS,
    enumName: 'PointTransactionFilterField',
  })
  @IsOptional()
  @IsIn(POINT_TRANSACTION_ALL_FILTER_FIELDS)
  filterField?: PointTransactionFilterField;

  @ApiPropertyOptional({
    enum: POINT_TRANSACTION_SORT_FIELDS,
    enumName: 'PointTransactionSortField',
  })
  @IsOptional()
  @IsIn(POINT_TRANSACTION_SORT_FIELDS)
  sortBy?: PointTransactionSortField;
}
