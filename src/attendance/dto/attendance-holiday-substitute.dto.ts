import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_HOLIDAY_SUBSTITUTE_STRING_FILTER_FIELDS = [
  'employeeName',
  'holidayName',
  'holidayDate',
] as const;

export const ATTENDANCE_HOLIDAY_SUBSTITUTE_DATE_FILTER_FIELDS = [
  'substituteStartsAt',
] as const;

export const ATTENDANCE_HOLIDAY_SUBSTITUTE_FILTER_FIELDS = [
  ...ATTENDANCE_HOLIDAY_SUBSTITUTE_STRING_FILTER_FIELDS,
  ...ATTENDANCE_HOLIDAY_SUBSTITUTE_DATE_FILTER_FIELDS,
] as const;

export type AttendanceHolidaySubstituteFilterField =
  (typeof ATTENDANCE_HOLIDAY_SUBSTITUTE_FILTER_FIELDS)[number];

export class AttendanceHolidaySubstitutePaginationQueryDto extends PaginationQueryDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2099) year: number;
  @ApiPropertyOptional({
    enum: ATTENDANCE_HOLIDAY_SUBSTITUTE_FILTER_FIELDS,
    enumName: 'AttendanceHolidaySubstituteFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_HOLIDAY_SUBSTITUTE_FILTER_FIELDS)
  filterField?: AttendanceHolidaySubstituteFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_HOLIDAY_SUBSTITUTE_FILTER_FIELDS,
    enumName: 'AttendanceHolidaySubstituteSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_HOLIDAY_SUBSTITUTE_FILTER_FIELDS)
  sortBy?: AttendanceHolidaySubstituteFilterField;
}

export class CreateAttendanceHolidaySubstituteDto {
  @IsUUID() employeeId: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) holidayDate: string;
  @IsUUID() shiftId: string;
}

export class AttendanceHolidaySubstituteResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() holidayDate: string;
  @ApiProperty() holidayName: string;
  @ApiProperty() owed: boolean;
  @ApiPropertyOptional({ nullable: true, type: String })
  substituteId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  substituteShiftId: string | null;
  @ApiPropertyOptional({ nullable: true, type: Date })
  substituteStartsAt: Date | null;
}

export class AttendanceHolidaySubstitutesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceHolidaySubstituteResponseDto })
  data: AttendanceHolidaySubstituteResponseDto[];
  @ApiProperty() total: number;
}
