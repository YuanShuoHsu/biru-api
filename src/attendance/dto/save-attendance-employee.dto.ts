import { ApiProperty } from '@nestjs/swagger';

import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import {
  ATTENDANCE_LEGAL_STATUSES,
  type AttendanceLegalStatus,
} from 'src/db/schema/attendance';

export class SaveAttendanceEmployeeDto {
  @IsString() @MinLength(1) userId: string;
  @IsBoolean() enabled: boolean;
  @ApiProperty({
    enum: ATTENDANCE_LEGAL_STATUSES,
    enumName: 'AttendanceLegalStatus',
  })
  @IsIn(ATTENDANCE_LEGAL_STATUSES)
  legalStatus: AttendanceLegalStatus;
  @IsDateString() hiredAt: string;
  @IsOptional() @IsDateString() terminatedAt?: string;
}
