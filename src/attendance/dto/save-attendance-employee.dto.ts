import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsRFC3339,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_LEGAL_STATUSES,
  ATTENDANCE_TERMINATION_REASONS,
  type AttendanceLegalStatus,
  type AttendanceTerminationReason,
} from '../../db/schema/attendance.js';

export class DatePeriodDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) from: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) to: string;
}

export class SaveAttendanceEmployeeDto {
  @IsString() @MinLength(1) userId: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  birthDate: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  taiwanStaySince?: string;
  @ApiProperty({
    enum: ATTENDANCE_LEGAL_STATUSES,
    enumName: 'AttendanceLegalStatus',
  })
  @IsIn(ATTENDANCE_LEGAL_STATUSES)
  legalStatus: AttendanceLegalStatus;
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DatePeriodDto)
  studentVacations: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DatePeriodDto)
  workPermits: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DatePeriodDto)
  pregnancyPeriods: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DatePeriodDto)
  nursingPeriods: DatePeriodDto[];
  @ApiProperty({
    description:
      '性平法 §19 每日減少工作時間一小時的期間，須在已登記子女滿三歲前',
    isArray: true,
    type: DatePeriodDto,
  })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DatePeriodDto)
  childcareReductionPeriods: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: String })
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  @IsISO8601({ strict: true }, { each: true })
  indigenousHolidays: string[];
  @IsOptional() @IsInt() @Min(0) @Max(6) regularLeaveWeekday?: number;
  @IsOptional() @IsInt() @Min(0) @Max(6) restDayWeekday?: number;
  @IsRFC3339() @IsISO8601({ strict: true }) hiredAt: string;
  @IsOptional() @IsRFC3339() @IsISO8601({ strict: true }) terminatedAt?: string;
  @ApiPropertyOptional({
    enum: ATTENDANCE_TERMINATION_REASONS,
    enumName: 'AttendanceTerminationReason',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_TERMINATION_REASONS)
  terminationReason?: AttendanceTerminationReason;
  @IsOptional()
  @IsRFC3339()
  @IsISO8601({ strict: true })
  terminationNoticedAt?: string;
}
