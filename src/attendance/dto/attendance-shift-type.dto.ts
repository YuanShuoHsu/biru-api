import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const ATTENDANCE_SHIFT_TYPE_FILTER_FIELDS = [
  'name',
  'startTime',
  'endTime',
] as const;

export type AttendanceShiftTypeFilterField =
  (typeof ATTENDANCE_SHIFT_TYPE_FILTER_FIELDS)[number];

export const ATTENDANCE_SHIFT_TYPE_SORT_FIELDS =
  ATTENDANCE_SHIFT_TYPE_FILTER_FIELDS;

export type AttendanceShiftTypeSortField =
  (typeof ATTENDANCE_SHIFT_TYPE_SORT_FIELDS)[number];

export class AttendanceShiftTypePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_SHIFT_TYPE_FILTER_FIELDS,
    enumName: 'AttendanceShiftTypeFilterField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SHIFT_TYPE_FILTER_FIELDS)
  filterField?: AttendanceShiftTypeFilterField;
  @ApiPropertyOptional({
    enum: ATTENDANCE_SHIFT_TYPE_SORT_FIELDS,
    enumName: 'AttendanceShiftTypeSortField',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SHIFT_TYPE_SORT_FIELDS)
  sortBy?: AttendanceShiftTypeSortField;
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SaveAttendanceShiftTypeDto {
  @IsString() @MinLength(1) @MaxLength(50) name: string;
  @ApiProperty({ description: '店家時區的 HH:mm', example: '09:00' })
  @Matches(TIME_OF_DAY)
  startTime: string;
  @ApiProperty({
    description: '店家時區的 HH:mm，早於開始時間表示隔日結束',
    example: '17:00',
  })
  @Matches(TIME_OF_DAY)
  endTime: string;
}

export class AttendanceShiftTypeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() startTime: string;
  @ApiProperty() endTime: string;
  @ApiProperty() createdAt: Date;
}

export class AttendanceShiftTypesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceShiftTypeResponseDto })
  data: AttendanceShiftTypeResponseDto[];
  @ApiProperty() total: number;
}
