import {
  STATUTORY_LEAVE_KINDS,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';

import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import { AttendanceEventResponseDto } from './attendance-shift-response.dto';

export class EmergencyWorkResponseDto {
  @ApiProperty({
    enum: ['disaster', 'incident', 'unexpected'],
    enumName: 'AttendanceEmergencyCause',
  })
  cause: 'disaster' | 'incident' | 'unexpected';
  @ApiProperty() reportedAt: string;
  @ApiProperty() makeupStartsAt: string;
  @ApiProperty() makeupEndsAt: string;
}

export class AttendanceRequestResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiPropertyOptional() shiftId: string | null;
  @ApiProperty({
    enum: ['correction', 'leave', 'overtime'],
    enumName: 'AttendanceRequestKind',
  })
  kind: 'correction' | 'leave' | 'overtime';
  @ApiProperty({
    enum: [
      'pending',
      'approved',
      'rejected',
      'withdrawn',
      'cancellationPending',
      'cancelled',
    ],
    enumName: 'AttendanceRequestStatus',
  })
  status:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'withdrawn'
    | 'cancellationPending'
    | 'cancelled';
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiProperty() reason: string;
  @ApiPropertyOptional() reviewReason: string | null;
  @ApiPropertyOptional() leaveTypeId: string | null;
  @ApiPropertyOptional() leaveTypeName: string | null;
  @ApiPropertyOptional({
    enum: STATUTORY_LEAVE_KINDS,
    enumName: 'StatutoryLeaveKind',
    nullable: true,
  })
  leaveTypeStatutoryKind: StatutoryLeaveKind | null;
  @ApiPropertyOptional() leaveCaseId: string | null;
  @ApiPropertyOptional() leaveMinutes: number | null;
  @ApiPropertyOptional() paidPercent: number | null;
  @ApiPropertyOptional() reviewedBy: string | null;
  @ApiPropertyOptional({ type: EmergencyWorkResponseDto })
  emergency: EmergencyWorkResponseDto | null;
  @ApiProperty({
    enum: ['daily', 'continuous'],
    enumName: 'AttendanceParentalMode',
    nullable: true,
  })
  parentalMode: 'daily' | 'continuous' | null;
  @ApiProperty() returnPending: boolean;
  @ApiPropertyOptional() originalEndsAt: Date | null;
  @ApiPropertyOptional({ isArray: true, type: AttendanceEventResponseDto })
  correctedEvents: AttendanceEventResponseDto[] | null;
  @ApiPropertyOptional() shiftStartsAt: Date | null;
  @ApiPropertyOptional() shiftEndsAt: Date | null;
  @ApiPropertyOptional({ isArray: true, type: AttendanceEventResponseDto })
  originalEvents: AttendanceEventResponseDto[] | null;
  @ApiPropertyOptional() reviewedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AttendanceRequestRecordResponseDto extends OmitType(
  AttendanceRequestResponseDto,
  [
    'employeeName',
    'leaveTypeName',
    'leaveTypeStatutoryKind',
    'returnPending',
    'shiftStartsAt',
    'shiftEndsAt',
    'originalEvents',
  ] as const,
) {}

export class AttendanceRequestsResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceRequestResponseDto })
  data: AttendanceRequestResponseDto[];
  @ApiProperty() total: number;
}
