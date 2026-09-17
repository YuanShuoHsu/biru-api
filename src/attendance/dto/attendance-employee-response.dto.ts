import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttendanceWeeklyMinutesChangeResponseDto {
  @ApiProperty() from: string;
  @ApiProperty() minutes: number;
}

export class AttendanceEmployeeResponseDto {
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

export class AttendanceEmployeesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceEmployeeResponseDto })
  data: AttendanceEmployeeResponseDto[];
  @ApiProperty() total: number;
}

export class AttendanceMemberResponseDto {
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
}

export class AttendanceContextResponseDto {
  @ApiPropertyOptional({ type: AttendanceEmployeeResponseDto })
  employee: AttendanceEmployeeResponseDto | null;
  @ApiProperty() canManage: boolean;
  @ApiProperty() canManageSettings: boolean;
  @ApiProperty() canManagePayroll: boolean;
}
