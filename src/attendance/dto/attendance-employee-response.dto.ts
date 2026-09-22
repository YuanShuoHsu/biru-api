import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ATTENDANCE_EMPLOYEE_STATUSES,
  type AttendanceEmployeeStatus,
} from 'src/db/schema/attendance';

export class AttendanceWeeklyMinutesChangeResponseDto {
  @ApiProperty() from: string;
  @ApiProperty() minutes: number;
}

export class AttendanceEmploymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiProperty() weeklyMinutes: number;
  @ApiProperty({
    isArray: true,
    type: AttendanceWeeklyMinutesChangeResponseDto,
  })
  weeklyMinutesHistory: AttendanceWeeklyMinutesChangeResponseDto[];
  @ApiProperty() enabled: boolean;
  @ApiProperty() hiredAt: Date;
  @ApiPropertyOptional() terminatedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AttendanceEmployeeResponseDto extends AttendanceEmploymentResponseDto {
  @ApiProperty({
    enum: ATTENDANCE_EMPLOYEE_STATUSES,
    enumName: 'AttendanceEmployeeStatus',
  })
  status: AttendanceEmployeeStatus;
}

export class AttendanceEmployeesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceEmployeeResponseDto })
  data: AttendanceEmployeeResponseDto[];
  @ApiProperty() total: number;
}

export class AttendanceMemberResponseDto {
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty() joinedAt: Date;
  @ApiProperty({
    enum: ATTENDANCE_EMPLOYEE_STATUSES,
    enumName: 'AttendanceEmployeeStatus',
  })
  status: AttendanceEmployeeStatus;
  @ApiPropertyOptional({
    nullable: true,
    type: AttendanceEmploymentResponseDto,
  })
  employee: AttendanceEmploymentResponseDto | null;
}

export class AttendanceMembersResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceMemberResponseDto })
  data: AttendanceMemberResponseDto[];
  @ApiProperty() total: number;
}

export class AttendanceContextResponseDto {
  @ApiPropertyOptional({ type: AttendanceEmployeeResponseDto })
  employee: AttendanceEmployeeResponseDto | null;
  @ApiProperty() canManage: boolean;
  @ApiProperty() canManageSettings: boolean;
  @ApiProperty() canManagePayroll: boolean;
}
