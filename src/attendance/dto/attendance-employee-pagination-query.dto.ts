import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_EMPLOYEE_STRING_FILTER_FIELDS = [
  'name',
  'email',
] as const;

export const ATTENDANCE_EMPLOYEE_DATE_FILTER_FIELDS = [
  'hiredAt',
  'terminatedAt',
] as const;

export const ATTENDANCE_EMPLOYEE_NUMBER_FILTER_FIELDS = [
  'weeklyMinutes',
] as const;

export const ATTENDANCE_EMPLOYEE_BOOLEAN_FILTER_FIELDS = ['enabled'] as const;

export const ATTENDANCE_EMPLOYEE_FILTER_FIELDS = [
  ...ATTENDANCE_EMPLOYEE_STRING_FILTER_FIELDS,
  ...ATTENDANCE_EMPLOYEE_DATE_FILTER_FIELDS,
  ...ATTENDANCE_EMPLOYEE_NUMBER_FILTER_FIELDS,
  ...ATTENDANCE_EMPLOYEE_BOOLEAN_FILTER_FIELDS,
] as const;

export type AttendanceEmployeeFilterField =
  (typeof ATTENDANCE_EMPLOYEE_FILTER_FIELDS)[number];

export const ATTENDANCE_EMPLOYEE_SORT_FIELDS =
  ATTENDANCE_EMPLOYEE_FILTER_FIELDS;

export type AttendanceEmployeeSortField =
  (typeof ATTENDANCE_EMPLOYEE_SORT_FIELDS)[number];

export class AttendanceEmployeePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_EMPLOYEE_FILTER_FIELDS,
    enumName: 'AttendanceEmployeeFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_EMPLOYEE_FILTER_FIELDS)
  filterField?: AttendanceEmployeeFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_EMPLOYEE_SORT_FIELDS,
    enumName: 'AttendanceEmployeeSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_EMPLOYEE_SORT_FIELDS)
  sortBy?: AttendanceEmployeeSortField;
}
