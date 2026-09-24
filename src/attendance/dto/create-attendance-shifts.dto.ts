import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_DAY_KINDS,
  type AttendanceDayKind,
} from 'src/db/schema/attendance';

export class ShiftBreakDto {
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
}

export class CreateAttendanceShiftDto {
  @IsUUID() employeeId: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsBoolean() paidBreak: boolean;
  @ApiProperty({ isArray: true, type: ShiftBreakDto })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ShiftBreakDto)
  breaks: ShiftBreakDto[];
  @ApiProperty({ enum: ATTENDANCE_DAY_KINDS, enumName: 'AttendanceDayKind' })
  @IsIn(ATTENDANCE_DAY_KINDS)
  dayKind: AttendanceDayKind;
}

export class CreateAttendanceShiftsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateAttendanceShiftDto)
  shifts: CreateAttendanceShiftDto[];
}
