import { ApiProperty } from '@nestjs/swagger';

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  ATTENDANCE_DAY_KINDS,
  type AttendanceDayKind,
} from 'src/db/schema/attendance';

export class SaveAttendanceTemplateDto {
  @IsUUID() employeeId: string;
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsInt() @Min(0) @Max(6) weekday: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime: string;
  @IsBoolean() nextDay: boolean;
  @IsBoolean() paidBreak: boolean;
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  breakStartTime?: string;
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  breakEndTime?: string;
  @ApiProperty({ enum: ATTENDANCE_DAY_KINDS, enumName: 'AttendanceDayKind' })
  @IsIn(ATTENDANCE_DAY_KINDS)
  dayKind: AttendanceDayKind;
}
