import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';

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
  ValidateNested,
} from 'class-validator';

import {
  ATTENDANCE_SCHEDULED_DAY_KINDS,
  type AttendanceScheduledDayKind,
} from 'src/db/schema/attendance';

export class CreateAttendanceShiftDto {
  @IsUUID() employeeId: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsBoolean() paidBreak: boolean;
  @ApiPropertyOptional({
    description: '員工設有固定例假日與休息日時由星期推得，未設定者必填',
    enum: ATTENDANCE_SCHEDULED_DAY_KINDS,
    enumName: 'AttendanceScheduledDayKind',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SCHEDULED_DAY_KINDS)
  dayKind?: AttendanceScheduledDayKind;
  @ApiPropertyOptional({
    description: '員工必須是該團隊的成員',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  teamId?: string | null;
}

export class UpdateAttendanceShiftDto extends OmitType(
  CreateAttendanceShiftDto,
  ['employeeId', 'dayKind', 'teamId'] as const,
) {
  @ApiPropertyOptional({ description: '改排給其他員工，省略則沿用原員工' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
  @ApiPropertyOptional({
    description:
      '員工設有固定例假日與休息日時由星期推得；未設定者移到其他日期或改排其他員工時必填，同員工同日省略則沿用原日別',
    enum: ATTENDANCE_SCHEDULED_DAY_KINDS,
    enumName: 'AttendanceScheduledDayKind',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_SCHEDULED_DAY_KINDS)
  dayKind?: AttendanceScheduledDayKind;
  @ApiPropertyOptional({
    description: '省略則沿用原團隊，null 則清除',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  teamId?: string | null;
  @ApiPropertyOptional({ description: '只檢查能否排入，不寫入' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class CreateAttendanceShiftsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateAttendanceShiftDto)
  shifts: CreateAttendanceShiftDto[];
  @ApiPropertyOptional({ description: '只檢查能否排入，不寫入' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
