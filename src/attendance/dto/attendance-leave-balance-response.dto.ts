import {
  STATUTORY_LEAVE_KINDS,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';

import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

export class AttendanceLeaveBalanceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() leaveTypeId: string;
  @ApiProperty() leaveTypeName: string;
  @ApiProperty({
    enum: STATUTORY_LEAVE_KINDS,
    enumName: 'StatutoryLeaveKind',
  })
  leaveTypeStatutoryKind: StatutoryLeaveKind;
  @ApiProperty() year: number;
  @ApiProperty() grantedMinutes: number;
  @ApiProperty() usedMinutes: number;
  @ApiProperty() statutory: boolean;
  @ApiPropertyOptional() startsAt: Date | null;
  @ApiPropertyOptional() endsAt: Date | null;
}

export class AttendanceLeaveBalanceRecordResponseDto extends PickType(
  AttendanceLeaveBalanceResponseDto,
  [
    'id',
    'organizationId',
    'employeeId',
    'leaveTypeId',
    'year',
    'grantedMinutes',
    'usedMinutes',
  ] as const,
) {}

export class AttendanceLeaveBalancesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceLeaveBalanceResponseDto })
  data: AttendanceLeaveBalanceResponseDto[];
  @ApiProperty() total: number;
}
