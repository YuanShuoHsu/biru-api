import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_TEMPLATE_STRING_FILTER_FIELDS = [
  'name',
  'employeeName',
  'startTime',
  'endTime',
] as const;

export const ATTENDANCE_TEMPLATE_ENUM_FILTER_FIELDS = ['dayKind'] as const;

export const ATTENDANCE_TEMPLATE_NUMBER_FILTER_FIELDS = ['weekday'] as const;

export const ATTENDANCE_TEMPLATE_BOOLEAN_FILTER_FIELDS = [
  'nextDay',
  'paidBreak',
] as const;

export const ATTENDANCE_TEMPLATE_FILTER_FIELDS = [
  ...ATTENDANCE_TEMPLATE_STRING_FILTER_FIELDS,
  ...ATTENDANCE_TEMPLATE_ENUM_FILTER_FIELDS,
  ...ATTENDANCE_TEMPLATE_NUMBER_FILTER_FIELDS,
  ...ATTENDANCE_TEMPLATE_BOOLEAN_FILTER_FIELDS,
] as const;

export type AttendanceTemplateFilterField =
  (typeof ATTENDANCE_TEMPLATE_FILTER_FIELDS)[number];

export const ATTENDANCE_TEMPLATE_SORT_FIELDS =
  ATTENDANCE_TEMPLATE_FILTER_FIELDS;

export type AttendanceTemplateSortField =
  (typeof ATTENDANCE_TEMPLATE_SORT_FIELDS)[number];

export class AttendanceTemplatePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_TEMPLATE_FILTER_FIELDS,
    enumName: 'AttendanceTemplateFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_TEMPLATE_FILTER_FIELDS)
  filterField?: AttendanceTemplateFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_TEMPLATE_SORT_FIELDS,
    enumName: 'AttendanceTemplateSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_TEMPLATE_SORT_FIELDS)
  sortBy?: AttendanceTemplateSortField;
}
