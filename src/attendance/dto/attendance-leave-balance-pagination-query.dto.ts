import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_LEAVE_BALANCE_STRING_FILTER_FIELDS = [
  'employeeName',
  'leaveTypeName',
] as const;

export const ATTENDANCE_LEAVE_BALANCE_DATE_FILTER_FIELDS = [
  'startsAt',
  'endsAt',
] as const;

export const ATTENDANCE_LEAVE_BALANCE_NUMBER_FILTER_FIELDS = [
  'year',
  'grantedMinutes',
  'usedMinutes',
] as const;

export const ATTENDANCE_LEAVE_BALANCE_FILTER_FIELDS = [
  ...ATTENDANCE_LEAVE_BALANCE_STRING_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_BALANCE_DATE_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_BALANCE_NUMBER_FILTER_FIELDS,
] as const;

export type AttendanceLeaveBalanceFilterField =
  (typeof ATTENDANCE_LEAVE_BALANCE_FILTER_FIELDS)[number];

export const ATTENDANCE_LEAVE_BALANCE_SORT_FIELDS =
  ATTENDANCE_LEAVE_BALANCE_FILTER_FIELDS;

export type AttendanceLeaveBalanceSortField =
  (typeof ATTENDANCE_LEAVE_BALANCE_SORT_FIELDS)[number];

export class AttendanceLeaveBalancePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_LEAVE_BALANCE_FILTER_FIELDS,
    enumName: 'AttendanceLeaveBalanceFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_LEAVE_BALANCE_FILTER_FIELDS)
  filterField?: AttendanceLeaveBalanceFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_LEAVE_BALANCE_SORT_FIELDS,
    enumName: 'AttendanceLeaveBalanceSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_LEAVE_BALANCE_SORT_FIELDS)
  sortBy?: AttendanceLeaveBalanceSortField;
}
