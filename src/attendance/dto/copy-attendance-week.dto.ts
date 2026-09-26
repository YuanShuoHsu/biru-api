import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

import type { AttendanceDayKind } from 'src/db/schema/attendance';

import type { AttendanceErrorCode } from '../attendance-errors';

export const ATTENDANCE_COPY_SKIP_REASONS = [
  'holiday',
  'restDay',
  'regularLeave',
  'employeeNotEnabled',
  'workPermitRequired',
  'maternalNightWork',
  'shiftTooLong',
  'invalidBreak',
  'breakTooShort',
  'continuousWorkTooLong',
  'inconsistentDayKind',
  'payrollLocked',
  'reservedMakeupRest',
  'overlappingShift',
  'overlappingLeave',
] as const satisfies readonly (
  | AttendanceErrorCode
  | Exclude<AttendanceDayKind, 'workday'>
)[];

export type AttendanceCopySkipReason =
  (typeof ATTENDANCE_COPY_SKIP_REASONS)[number];

export class CopyAttendanceWeekDto {
  @ApiProperty({ description: '來源週第一天（YYYY-MM-DD），往後 7 天為來源' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  weeks: number;
  @ApiPropertyOptional({ description: '只回傳預計結果，不建立班次' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class AttendanceCopyWeekShiftResponseDto {
  @ApiProperty() sourceShiftId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() startsAt: string;
  @ApiProperty() endsAt: string;
}

export class AttendanceCopiedShiftResponseDto extends AttendanceCopyWeekShiftResponseDto {
  @ApiPropertyOptional({ description: 'dryRun 時不回傳' }) id?: string;
}

export class AttendanceSkippedShiftResponseDto extends AttendanceCopyWeekShiftResponseDto {
  @ApiProperty({
    enum: ATTENDANCE_COPY_SKIP_REASONS,
    enumName: 'AttendanceCopySkipReason',
  })
  reason: AttendanceCopySkipReason;
}

export class AttendanceCopyWeekResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceCopiedShiftResponseDto })
  created: AttendanceCopiedShiftResponseDto[];
  @ApiProperty({ isArray: true, type: AttendanceSkippedShiftResponseDto })
  skipped: AttendanceSkippedShiftResponseDto[];
}
