import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_LEAVE_CASE_STRING_FILTER_FIELDS = [
  'employeeName',
  'reference',
  'reason',
] as const;

export const ATTENDANCE_LEAVE_CASE_ENUM_FILTER_FIELDS = [
  'leaveTypeName',
  'leaveTypeStatutoryKind',
] as const;

export const ATTENDANCE_LEAVE_CASE_DATE_FILTER_FIELDS = [
  'eventDate',
  'startsAt',
  'endsAt',
] as const;

export const ATTENDANCE_LEAVE_CASE_NUMBER_FILTER_FIELDS = [
  'grantedMinutes',
  'paidPercent',
] as const;

export const ATTENDANCE_LEAVE_CASE_FILTER_FIELDS = [
  ...ATTENDANCE_LEAVE_CASE_STRING_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_CASE_ENUM_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_CASE_DATE_FILTER_FIELDS,
  ...ATTENDANCE_LEAVE_CASE_NUMBER_FILTER_FIELDS,
] as const;

export type AttendanceLeaveCaseFilterField =
  (typeof ATTENDANCE_LEAVE_CASE_FILTER_FIELDS)[number];

export const ATTENDANCE_LEAVE_CASE_SORT_FIELDS =
  ATTENDANCE_LEAVE_CASE_FILTER_FIELDS;

export type AttendanceLeaveCaseSortField =
  (typeof ATTENDANCE_LEAVE_CASE_SORT_FIELDS)[number];

export class AttendanceLeaveCasePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_LEAVE_CASE_FILTER_FIELDS,
    enumName: 'AttendanceLeaveCaseFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_LEAVE_CASE_FILTER_FIELDS)
  filterField?: AttendanceLeaveCaseFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_LEAVE_CASE_SORT_FIELDS,
    enumName: 'AttendanceLeaveCaseSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_LEAVE_CASE_SORT_FIELDS)
  sortBy?: AttendanceLeaveCaseSortField;
}
