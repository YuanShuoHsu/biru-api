import { ApiProperty } from '@nestjs/swagger';

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  STATUTORY_LEAVE_KINDS,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';

export class SaveAttendanceLeaveTypeDto {
  @ApiProperty({
    enum: STATUTORY_LEAVE_KINDS,
    enumName: 'StatutoryLeaveKind',
    required: false,
  })
  @IsOptional()
  @IsIn(STATUTORY_LEAVE_KINDS)
  statutoryKind?: StatutoryLeaveKind;
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsInt() @Min(0) @Max(100) paidPercent: number;
  @IsBoolean() requiresBalance: boolean;
  @IsBoolean() enabled: boolean;
}
