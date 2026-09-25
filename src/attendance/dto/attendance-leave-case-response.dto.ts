import {
  STATUTORY_LEAVE_KINDS,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';

import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

export class AttendanceLeaveCaseResponseDto {
  @ApiPropertyOptional() childId: string | null;
  @ApiProperty() id: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() leaveTypeId: string;
  @ApiProperty() leaveTypeName: string;
  @ApiProperty({
    enum: STATUTORY_LEAVE_KINDS,
    enumName: 'StatutoryLeaveKind',
  })
  leaveTypeStatutoryKind: StatutoryLeaveKind;
  @ApiProperty() calendarLeave: boolean;
  @ApiProperty() reference: string;
  @ApiProperty() eventDate: Date;
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiProperty() grantedMinutes: number;
  @ApiProperty() usedMinutes: number;
  @ApiProperty() paidPercent: number;
  @ApiProperty() reason: string;
}

export class AttendanceLeaveCaseRecordResponseDto extends OmitType(
  AttendanceLeaveCaseResponseDto,
  [
    'employeeName',
    'leaveTypeName',
    'leaveTypeStatutoryKind',
    'calendarLeave',
    'usedMinutes',
  ] as const,
) {}

export class AttendanceLeaveCasesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceLeaveCaseResponseDto })
  data: AttendanceLeaveCaseResponseDto[];
  @ApiProperty() total: number;
}
