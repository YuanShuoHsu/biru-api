import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_PARENTAL_RETURN_STRING_FILTER_FIELDS = [
  'employeeName',
  'reason',
  'reviewReason',
] as const;

export const ATTENDANCE_PARENTAL_RETURN_DATE_FILTER_FIELDS = [
  'returnsAt',
  'originalStartsAt',
  'originalEndsAt',
] as const;

export const ATTENDANCE_PARENTAL_RETURN_ENUM_FILTER_FIELDS = [
  'status',
] as const;

export const ATTENDANCE_PARENTAL_RETURN_FILTER_FIELDS = [
  ...ATTENDANCE_PARENTAL_RETURN_STRING_FILTER_FIELDS,
  ...ATTENDANCE_PARENTAL_RETURN_DATE_FILTER_FIELDS,
  ...ATTENDANCE_PARENTAL_RETURN_ENUM_FILTER_FIELDS,
] as const;

export type AttendanceParentalReturnFilterField =
  (typeof ATTENDANCE_PARENTAL_RETURN_FILTER_FIELDS)[number];

export const ATTENDANCE_PARENTAL_RETURN_SORT_FIELDS =
  ATTENDANCE_PARENTAL_RETURN_FILTER_FIELDS;

export type AttendanceParentalReturnSortField =
  (typeof ATTENDANCE_PARENTAL_RETURN_SORT_FIELDS)[number];

export class AttendanceParentalReturnPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_PARENTAL_RETURN_FILTER_FIELDS,
    enumName: 'AttendanceParentalReturnFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_PARENTAL_RETURN_FILTER_FIELDS)
  filterField?: AttendanceParentalReturnFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_PARENTAL_RETURN_SORT_FIELDS,
    enumName: 'AttendanceParentalReturnSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_PARENTAL_RETURN_SORT_FIELDS)
  sortBy?: AttendanceParentalReturnSortField;
}
