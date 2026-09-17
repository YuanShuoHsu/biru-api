import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import {
  ATTENDANCE_DAY_KINDS,
  type AttendanceDayKind,
} from 'src/db/schema/attendance';

export class AttendanceTemplateResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() name: string;
  @ApiProperty() weekday: number;
  @ApiProperty() startTime: string;
  @ApiProperty() endTime: string;
  @ApiProperty() nextDay: boolean;
  @ApiProperty() paidBreak: boolean;
  @ApiPropertyOptional() breakStartTime: string | null;
  @ApiPropertyOptional() breakEndTime: string | null;
  @ApiProperty({ enum: ATTENDANCE_DAY_KINDS, enumName: 'AttendanceDayKind' })
  dayKind: AttendanceDayKind;
}

export class AttendanceTemplateRecordResponseDto extends OmitType(
  AttendanceTemplateResponseDto,
  ['employeeName'] as const,
) {}

export class AttendanceTemplatesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceTemplateResponseDto })
  data: AttendanceTemplateResponseDto[];
  @ApiProperty() total: number;
}
