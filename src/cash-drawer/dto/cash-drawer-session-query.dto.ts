import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const CASH_DRAWER_SESSION_STRING_FILTER_FIELDS = [
  'openedByName',
  'closedByName',
  'varianceNote',
] as const;
export const CASH_DRAWER_SESSION_ENUM_FILTER_FIELDS = ['status'] as const;
export const CASH_DRAWER_SESSION_NUMBER_FILTER_FIELDS = [
  'openingFloat',
  'expectedCash',
  'countedCash',
  'variance',
  'retainedFloat',
] as const;
export const CASH_DRAWER_SESSION_DATE_FILTER_FIELDS = [
  'openedAt',
  'closedAt',
] as const;
export const CASH_DRAWER_SESSION_PLAIN_DATE_FILTER_FIELDS = [
  'businessDate',
] as const;
const CASH_DRAWER_SESSION_ALL_FILTER_FIELDS = [
  ...CASH_DRAWER_SESSION_STRING_FILTER_FIELDS,
  ...CASH_DRAWER_SESSION_ENUM_FILTER_FIELDS,
  ...CASH_DRAWER_SESSION_NUMBER_FILTER_FIELDS,
  ...CASH_DRAWER_SESSION_DATE_FILTER_FIELDS,
  ...CASH_DRAWER_SESSION_PLAIN_DATE_FILTER_FIELDS,
] as const;

type CashDrawerSessionField =
  (typeof CASH_DRAWER_SESSION_ALL_FILTER_FIELDS)[number];

export class CashDrawerSessionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CASH_DRAWER_SESSION_ALL_FILTER_FIELDS,
    enumName: 'CashDrawerSessionFilterField',
  })
  @IsOptional()
  @IsIn(CASH_DRAWER_SESSION_ALL_FILTER_FIELDS)
  filterField?: CashDrawerSessionField;

  @ApiPropertyOptional({
    enum: CASH_DRAWER_SESSION_ALL_FILTER_FIELDS,
    enumName: 'CashDrawerSessionSortField',
  })
  @IsOptional()
  @IsIn(CASH_DRAWER_SESSION_ALL_FILTER_FIELDS)
  sortBy?: CashDrawerSessionField;
}
