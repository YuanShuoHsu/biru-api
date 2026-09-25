import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_LEGAL_STATUSES,
  ATTENDANCE_TERMINATION_REASONS,
  type AttendanceLegalStatus,
  type AttendanceTerminationReason,
} from 'src/db/schema/attendance';

export class DatePeriodDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) from: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) to: string;
}

export class SaveAttendanceEmployeeDto {
  @IsString() @MinLength(1) userId: string;
  @IsBoolean() enabled: boolean;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
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
  maternalProtectionPeriods: DatePeriodDto[];
  @IsDateString() hiredAt: string;
  @IsOptional() @IsDateString() terminatedAt?: string;
  @ApiPropertyOptional({
    enum: ATTENDANCE_TERMINATION_REASONS,
    enumName: 'AttendanceTerminationReason',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_TERMINATION_REASONS)
  terminationReason?: AttendanceTerminationReason;
  @IsOptional() @IsDateString() terminationNoticedAt?: string;
}
