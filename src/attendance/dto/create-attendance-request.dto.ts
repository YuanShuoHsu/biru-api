import { ApiProperty } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_EVENT_ACTIONS,
  type AttendanceEventAction,
} from '../../db/schema/attendance.js';
import { trim } from '../../common/utils/trim.js';

export class CorrectedEventDto {
  @ApiProperty({
    enum: ATTENDANCE_EVENT_ACTIONS,
    enumName: 'AttendanceEventAction',
  })
  @IsIn(ATTENDANCE_EVENT_ACTIONS)
  action: AttendanceEventAction;
  @IsDateString() occurredAt: string;
}

export class CreateAttendanceRequestDto {
  @IsOptional() @IsUUID() leaveCaseId?: string;
  @ApiProperty({
    enum: ['correction', 'leave', 'overtime'],
    enumName: 'AttendanceRequestKind',
  })
  @IsIn(['correction', 'leave', 'overtime'])
  kind: 'correction' | 'leave' | 'overtime';
  @IsOptional() @IsUUID() shiftId?: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason: string;
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => CorrectedEventDto)
  correctedEvents?: CorrectedEventDto[];
}
