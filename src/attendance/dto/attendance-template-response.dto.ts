import { ApiProperty, OmitType } from '@nestjs/swagger';

import {
  ATTENDANCE_DAY_KINDS,
  type AttendanceDayKind,
} from 'src/db/schema/attendance';

import { TemplateBreakDto } from './save-attendance-template.dto';

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
  @ApiProperty({ isArray: true, type: TemplateBreakDto })
  breaks: TemplateBreakDto[];
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
