import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_REQUEST_STRING_FILTER_FIELDS = [
  'employeeName',
  'reason',
  'reviewReason',
] as const;

export const ATTENDANCE_REQUEST_DATE_FILTER_FIELDS = [
  'startsAt',
  'endsAt',
] as const;

export const ATTENDANCE_REQUEST_ENUM_FILTER_FIELDS = [
  'kind',
  'leaveTypeName',
  'leaveTypeStatutoryKind',
  'status',
] as const;

export const ATTENDANCE_REQUEST_FILTER_FIELDS = [
  ...ATTENDANCE_REQUEST_STRING_FILTER_FIELDS,
  ...ATTENDANCE_REQUEST_DATE_FILTER_FIELDS,
  ...ATTENDANCE_REQUEST_ENUM_FILTER_FIELDS,
] as const;

export type AttendanceRequestFilterField =
  (typeof ATTENDANCE_REQUEST_FILTER_FIELDS)[number];

export const ATTENDANCE_REQUEST_SORT_FIELDS = ATTENDANCE_REQUEST_FILTER_FIELDS;

export type AttendanceRequestSortField =
  (typeof ATTENDANCE_REQUEST_SORT_FIELDS)[number];

export class AttendanceRequestPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_REQUEST_FILTER_FIELDS,
    enumName: 'AttendanceRequestFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_REQUEST_FILTER_FIELDS)
  filterField?: AttendanceRequestFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_REQUEST_SORT_FIELDS,
    enumName: 'AttendanceRequestSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_REQUEST_SORT_FIELDS)
  sortBy?: AttendanceRequestSortField;
}
