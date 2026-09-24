import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import {
  ATTENDANCE_DAY_KINDS,
  ATTENDANCE_EVENT_ACTIONS,
  type AttendanceDayKind,
  type AttendanceEventAction,
} from 'src/db/schema/attendance';

import { ShiftBreakDto } from './create-attendance-shifts.dto';

export class AttendanceEventResponseDto {
  @ApiPropertyOptional() paidBreak?: boolean;
  @ApiProperty({
    enum: ATTENDANCE_EVENT_ACTIONS,
    enumName: 'AttendanceEventAction',
  })
  action: AttendanceEventAction;
  @ApiProperty() occurredAt: string;
}

export class AttendanceShiftResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
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
  @ApiProperty() late: boolean;
  @ApiProperty() early: boolean;
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
    'startsAt',
    'endsAt',
    'paidBreak',
    'breaks',
    'dayKind',
    'status',
    'createdAt',
  ] as const,
) {}

export class AttendancePunchResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() occurredAt: Date;
}

export class AttendanceShiftsResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceShiftResponseDto })
  data: AttendanceShiftResponseDto[];
  @ApiProperty() total: number;
}
