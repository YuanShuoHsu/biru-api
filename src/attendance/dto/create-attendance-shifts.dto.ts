import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_SCHEDULED_DAY_KINDS,
  type AttendanceScheduledDayKind,
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
  @ApiPropertyOptional({
    description: '員工設有固定例假日與休息日時由星期推得，未設定者必填',
    enum: ATTENDANCE_SCHEDULED_DAY_KINDS,
    enumName: 'AttendanceScheduledDayKind',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SCHEDULED_DAY_KINDS)
  dayKind?: AttendanceScheduledDayKind;
}

export class CreateAttendanceShiftsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateAttendanceShiftDto)
  shifts: CreateAttendanceShiftDto[];
}
