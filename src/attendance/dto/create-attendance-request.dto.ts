import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
} from 'src/db/schema/attendance';

export class CorrectedEventDto {
  @IsOptional() @IsBoolean() paidBreak?: boolean;
  @ApiProperty({
    enum: ATTENDANCE_EVENT_ACTIONS,
    enumName: 'AttendanceEventAction',
  })
  @IsIn(ATTENDANCE_EVENT_ACTIONS)
  action: AttendanceEventAction;
  @IsDateString() occurredAt: string;
}

export class CreateAttendanceRequestDto {
  @ApiProperty({
    enum: ['daily', 'continuous'],
    enumName: 'AttendanceParentalMode',
    required: false,
  })
  @IsOptional()
  @IsIn(['daily', 'continuous'])
  parentalMode?: 'daily' | 'continuous';
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
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
  @IsOptional() @IsString() leaveTypeId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CorrectedEventDto)
  correctedEvents?: CorrectedEventDto[];
}
