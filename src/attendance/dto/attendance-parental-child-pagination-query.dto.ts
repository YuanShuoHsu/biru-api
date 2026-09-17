import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_PARENTAL_CHILD_STRING_FILTER_FIELDS = [
  'employeeName',
  'reference',
  'label',
] as const;

export const ATTENDANCE_PARENTAL_CHILD_DATE_FILTER_FIELDS = [
  'birthDate',
] as const;

export const ATTENDANCE_PARENTAL_CHILD_FILTER_FIELDS = [
  ...ATTENDANCE_PARENTAL_CHILD_STRING_FILTER_FIELDS,
  ...ATTENDANCE_PARENTAL_CHILD_DATE_FILTER_FIELDS,
] as const;

export type AttendanceParentalChildFilterField =
  (typeof ATTENDANCE_PARENTAL_CHILD_FILTER_FIELDS)[number];

export const ATTENDANCE_PARENTAL_CHILD_SORT_FIELDS =
  ATTENDANCE_PARENTAL_CHILD_FILTER_FIELDS;

export type AttendanceParentalChildSortField =
  (typeof ATTENDANCE_PARENTAL_CHILD_SORT_FIELDS)[number];

export class AttendanceParentalChildPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_PARENTAL_CHILD_FILTER_FIELDS,
    enumName: 'AttendanceParentalChildFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_PARENTAL_CHILD_FILTER_FIELDS)
  filterField?: AttendanceParentalChildFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_PARENTAL_CHILD_SORT_FIELDS,
    enumName: 'AttendanceParentalChildSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_PARENTAL_CHILD_SORT_FIELDS)
  sortBy?: AttendanceParentalChildSortField;
}
