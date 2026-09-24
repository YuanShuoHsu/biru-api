import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_DAY_KINDS,
  type AttendanceDayKind,
} from 'src/db/schema/attendance';

export class TemplateBreakDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime: string;
}

export class SaveAttendanceTemplateDto {
  @IsUUID() employeeId: string;
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsInt() @Min(0) @Max(6) weekday: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime: string;
  @IsBoolean() nextDay: boolean;
  @IsBoolean() paidBreak: boolean;
  @ApiProperty({ isArray: true, type: TemplateBreakDto })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TemplateBreakDto)
  breaks: TemplateBreakDto[];
  @ApiProperty({ enum: ATTENDANCE_DAY_KINDS, enumName: 'AttendanceDayKind' })
  @IsIn(ATTENDANCE_DAY_KINDS)
  dayKind: AttendanceDayKind;
}
