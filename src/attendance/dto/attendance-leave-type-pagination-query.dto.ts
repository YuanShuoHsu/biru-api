import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_LEAVE_TYPE_STRING_FILTER_FIELDS = ['name'] as const;

export const ATTENDANCE_LEAVE_TYPE_ENUM_FILTER_FIELDS = [
  'statutoryKind',
] as const;

export const ATTENDANCE_LEAVE_TYPE_NUMBER_FILTER_FIELDS = [
  'paidPercent',
] as const;

export const ATTENDANCE_LEAVE_TYPE_BOOLEAN_FILTER_FIELDS = [
  'requiresBalance',
  'enabled',
] as const;

export const ATTENDANCE_LEAVE_TYPE_FILTER_FIELDS = [
  ...ATTENDANCE_LEAVE_TYPE_STRING_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_TYPE_ENUM_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_TYPE_NUMBER_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_TYPE_BOOLEAN_FILTER_FIELDS,
] as const;

export type AttendanceLeaveTypeFilterField =
  (typeof ATTENDANCE_LEAVE_TYPE_FILTER_FIELDS)[number];

export const ATTENDANCE_LEAVE_TYPE_SORT_FIELDS =
  ATTENDANCE_LEAVE_TYPE_FILTER_FIELDS;

export type AttendanceLeaveTypeSortField =
  (typeof ATTENDANCE_LEAVE_TYPE_SORT_FIELDS)[number];

export class AttendanceLeaveTypePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_LEAVE_TYPE_FILTER_FIELDS,
    enumName: 'AttendanceLeaveTypeFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_LEAVE_TYPE_FILTER_FIELDS)
  filterField?: AttendanceLeaveTypeFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_LEAVE_TYPE_SORT_FIELDS,
    enumName: 'AttendanceLeaveTypeSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_LEAVE_TYPE_SORT_FIELDS)
  sortBy?: AttendanceLeaveTypeSortField;
}
