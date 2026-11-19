import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const CASH_DEVICE_STRING_FILTER_FIELDS = [
  'name',
  'vendor',
  'model',
] as const;
export const CASH_DEVICE_ENUM_FILTER_FIELDS = ['status'] as const;
export const CASH_DEVICE_DATE_FILTER_FIELDS = [
  'lastSeenAt',
  'createdAt',
  'updatedAt',
] as const;
const CASH_DEVICE_FILTER_FIELDS = [
  ...CASH_DEVICE_STRING_FILTER_FIELDS,
  ...CASH_DEVICE_ENUM_FILTER_FIELDS,
  ...CASH_DEVICE_DATE_FILTER_FIELDS,
] as const;

type CashDeviceFilterField = (typeof CASH_DEVICE_FILTER_FIELDS)[number];

const CASH_DEVICE_SORT_FIELDS = CASH_DEVICE_FILTER_FIELDS;

type CashDeviceSortField = (typeof CASH_DEVICE_SORT_FIELDS)[number];

export class CashDevicePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CASH_DEVICE_FILTER_FIELDS,
    enumName: 'CashDeviceFilterField',
  })
  @IsOptional()
  @IsIn(CASH_DEVICE_FILTER_FIELDS)
  filterField?: CashDeviceFilterField;

  @ApiPropertyOptional({
    enum: CASH_DEVICE_SORT_FIELDS,
    enumName: 'CashDeviceSortField',
  })
  @IsOptional()
  @IsIn(CASH_DEVICE_SORT_FIELDS)
  sortBy?: CashDeviceSortField;
}
