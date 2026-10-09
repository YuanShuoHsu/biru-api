import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import {
  ATTENDANCE_DAY_KINDS,
  ATTENDANCE_EVENT_ACTIONS,
  type AttendanceDayKind,
  type AttendanceEventAction,
} from 'src/db/schema/attendance';

export class AttendanceEventResponseDto {
  @ApiPropertyOptional() paidBreak?: boolean;
  @ApiProperty({
    enum: ATTENDANCE_EVENT_ACTIONS,
    enumName: 'AttendanceEventAction',
  })
  action: AttendanceEventAction;
  @ApiProperty() occurredAt: string;
}

export class AttendanceIntervalResponseDto {
  @ApiProperty() startsAt: string;
  @ApiProperty() endsAt: string;
}

export class ShiftBreakDto {
  @ApiProperty() startsAt: string;
  @ApiProperty() endsAt: string;
}

export class AttendanceShiftResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() employeeEmail: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  teamId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  teamName: string | null;
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiProperty() paidBreak: boolean;
  @ApiProperty({ isArray: true, type: ShiftBreakDto })
  breaks: ShiftBreakDto[];
  @ApiPropertyOptional() clockInAt: Date | null;
  @ApiPropertyOptional() clockOutAt: Date | null;
  @ApiProperty({ enum: ATTENDANCE_DAY_KINDS, enumName: 'AttendanceDayKind' })
  dayKind: AttendanceDayKind;
  @ApiProperty() status: string;
  @ApiProperty({ enum: ['scheduled', 'working', 'resting', 'completed'] })
  state: 'scheduled' | 'working' | 'resting' | 'completed';
  @ApiProperty({
    enum: ATTENDANCE_EVENT_ACTIONS,
    enumName: 'AttendanceEventAction',
    isArray: true,
  })
  availableActions: AttendanceEventAction[];
  @ApiProperty() workedSeconds: number;
  @ApiProperty() breakSeconds: number;
  @ApiProperty() unpaidBreakSeconds: number;
  @ApiProperty({ isArray: true, type: AttendanceIntervalResponseDto })
  unreviewedOvertime: AttendanceIntervalResponseDto[];
  @ApiProperty() late: boolean;
  @ApiProperty() early: boolean;
  @ApiProperty({
    description:
      '工作日班次已結束仍未打卡，且請假未涵蓋排定工時（會擋住薪資結算）',
  })
  absent: boolean;
  @ApiProperty({
    description: '已上班但超過單日工時上限仍未打下班卡（會擋住薪資結算）',
  })
  missingClockOut: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ isArray: true, type: AttendanceEventResponseDto })
  events: AttendanceEventResponseDto[];
  @ApiProperty({
    isArray: true,
    nullable: true,
    type: AttendanceEventResponseDto,
  })
  originalEvents: AttendanceEventResponseDto[] | null;
}

export class AttendanceShiftRecordResponseDto extends PickType(
  AttendanceShiftResponseDto,
  [
    'id',
    'organizationId',
    'employeeId',
    'teamId',
    'startsAt',
    'endsAt',
    'paidBreak',
    'breaks',
    'dayKind',
    'status',
    'createdAt',
  ] as const,
) {}

export class AttendanceTeamResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({
    description: '屬於該團隊的出勤員工',
    isArray: true,
    type: String,
  })
  employeeIds: string[];
}

export class AttendancePunchResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() occurredAt: Date;
}

export class AttendanceShiftsResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceShiftResponseDto })
  data: AttendanceShiftResponseDto[];
  @ApiProperty() total: number;
}

export class AttendanceCalendarDayKindResponseDto {
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() date: string;
  @ApiProperty({ enum: ATTENDANCE_DAY_KINDS, enumName: 'AttendanceDayKind' })
  dayKind: AttendanceDayKind;
  @ApiPropertyOptional() holidayName?: string;
}

export class AttendanceCalendarHolidayResponseDto {
  @ApiProperty() date: string;
  @ApiProperty() name: string;
}

export class AttendanceCalendarPendingSubstituteResponseDto {
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() date: string;
  @ApiProperty() holidayName: string;
}

export class AttendanceCalendarDayKindsResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceCalendarHolidayResponseDto })
  holidays: AttendanceCalendarHolidayResponseDto[];
  @ApiProperty({ isArray: true, type: AttendanceCalendarDayKindResponseDto })
  dayKinds: AttendanceCalendarDayKindResponseDto[];
  @ApiProperty({
    isArray: true,
    type: AttendanceCalendarPendingSubstituteResponseDto,
  })
  pendingSubstitutes: AttendanceCalendarPendingSubstituteResponseDto[];
}
