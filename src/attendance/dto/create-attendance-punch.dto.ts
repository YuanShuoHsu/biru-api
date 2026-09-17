import { ApiProperty } from '@nestjs/swagger';

import {
  IsDateString,
  IsIn,
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  ATTENDANCE_EVENT_ACTIONS,
  type AttendanceEventAction,
} from 'src/db/schema/attendance';

export class CreateAttendancePunchDto {
  @IsUUID() shiftId: string;
  @IsUUID() idempotencyKey: string;
  @ApiProperty({
    enum: ATTENDANCE_EVENT_ACTIONS,
    enumName: 'AttendanceEventAction',
  })
  @IsIn(ATTENDANCE_EVENT_ACTIONS)
  action: AttendanceEventAction;
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsNumber() @Min(0) @Max(10000) accuracy: number;
  @IsDateString() locatedAt: string;
}
