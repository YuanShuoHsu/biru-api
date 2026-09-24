import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_SHIFT_STRING_FILTER_FIELDS = ['employeeName'] as const;

export const ATTENDANCE_SHIFT_DATE_FILTER_FIELDS = [
  'startsAt',
  'endsAt',
  'clockInAt',
  'clockOutAt',
] as const;

export const ATTENDANCE_SHIFT_ENUM_FILTER_FIELDS = ['dayKind'] as const;

export const ATTENDANCE_SHIFT_FILTER_FIELDS = [
  ...ATTENDANCE_SHIFT_STRING_FILTER_FIELDS,
  ...ATTENDANCE_SHIFT_DATE_FILTER_FIELDS,
  ...ATTENDANCE_SHIFT_ENUM_FILTER_FIELDS,
] as const;

export type AttendanceShiftFilterField =
  (typeof ATTENDANCE_SHIFT_FILTER_FIELDS)[number];

export const ATTENDANCE_SHIFT_SORT_FIELDS = [
  ...ATTENDANCE_SHIFT_FILTER_FIELDS,
  'state',
] as const;

export type AttendanceShiftSortField =
  (typeof ATTENDANCE_SHIFT_SORT_FIELDS)[number];

export class AttendanceShiftPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_SHIFT_FILTER_FIELDS,
    enumName: 'AttendanceShiftFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SHIFT_FILTER_FIELDS)
  filterField?: AttendanceShiftFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_SHIFT_SORT_FIELDS,
    enumName: 'AttendanceShiftSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SHIFT_SORT_FIELDS)
  sortBy?: AttendanceShiftSortField;
}
