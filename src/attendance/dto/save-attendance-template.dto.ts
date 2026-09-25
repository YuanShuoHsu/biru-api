import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_SCHEDULED_DAY_KINDS,
  type AttendanceScheduledDayKind,
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
  @IsBoolean() paidBreak: boolean;
  @ApiProperty({ isArray: true, type: TemplateBreakDto })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TemplateBreakDto)
  breaks: TemplateBreakDto[];
  @ApiPropertyOptional({
    description: '員工設有固定例假日與休息日時由星期推得，未設定者必填',
    enum: ATTENDANCE_SCHEDULED_DAY_KINDS,
    enumName: 'AttendanceScheduledDayKind',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SCHEDULED_DAY_KINDS)
  dayKind?: AttendanceScheduledDayKind;
}
