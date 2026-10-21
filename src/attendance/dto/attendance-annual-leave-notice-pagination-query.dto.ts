import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const ATTENDANCE_ANNUAL_LEAVE_SETTLEMENTS = [
  'ongoing',
  'paid',
  'deferred',
  'unrecorded',
  'nothingUnused',
] as const;

export type AttendanceAnnualLeaveSettlement =
  (typeof ATTENDANCE_ANNUAL_LEAVE_SETTLEMENTS)[number];

export const ATTENDANCE_ANNUAL_LEAVE_NOTICE_STRING_FILTER_FIELDS = [
  'employeeName',
  'employeeEmail',
] as const;

export const ATTENDANCE_ANNUAL_LEAVE_NOTICE_ENUM_FILTER_FIELDS = [
  'settlement',
] as const;

export const ATTENDANCE_ANNUAL_LEAVE_NOTICE_DATE_FILTER_FIELDS = [
  'periodStart',
  'periodEnd',
  'notifiedAt',
] as const;

export const ATTENDANCE_ANNUAL_LEAVE_NOTICE_NUMBER_FILTER_FIELDS = [
  'grantedMinutes',
  'carriedInMinutes',
  'usedMinutes',
  'unusedMinutes',
] as const;

export const ATTENDANCE_ANNUAL_LEAVE_NOTICE_FILTER_FIELDS = [
  ...ATTENDANCE_ANNUAL_LEAVE_NOTICE_STRING_FILTER_FIELDS,
  ...ATTENDANCE_ANNUAL_LEAVE_NOTICE_ENUM_FILTER_FIELDS,
  ...ATTENDANCE_ANNUAL_LEAVE_NOTICE_DATE_FILTER_FIELDS,
  ...ATTENDANCE_ANNUAL_LEAVE_NOTICE_NUMBER_FILTER_FIELDS,
] as const;

export type AttendanceAnnualLeaveNoticeFilterField =
  (typeof ATTENDANCE_ANNUAL_LEAVE_NOTICE_FILTER_FIELDS)[number];

export const ATTENDANCE_ANNUAL_LEAVE_NOTICE_SORT_FIELDS =
  ATTENDANCE_ANNUAL_LEAVE_NOTICE_FILTER_FIELDS;

export type AttendanceAnnualLeaveNoticeSortField =
  (typeof ATTENDANCE_ANNUAL_LEAVE_NOTICE_SORT_FIELDS)[number];

export class AttendanceAnnualLeaveNoticePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_ANNUAL_LEAVE_NOTICE_FILTER_FIELDS,
    enumName: 'AttendanceAnnualLeaveNoticeFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_ANNUAL_LEAVE_NOTICE_FILTER_FIELDS)
  filterField?: AttendanceAnnualLeaveNoticeFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_ANNUAL_LEAVE_NOTICE_SORT_FIELDS,
    enumName: 'AttendanceAnnualLeaveNoticeSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_ANNUAL_LEAVE_NOTICE_SORT_FIELDS)
  sortBy?: AttendanceAnnualLeaveNoticeSortField;
}
