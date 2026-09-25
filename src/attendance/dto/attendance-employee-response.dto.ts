import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DatePeriodDto } from './save-attendance-employee.dto';

import {
  ATTENDANCE_EMPLOYEE_STATUSES,
  ATTENDANCE_EMPLOYMENT_TYPES,
  ATTENDANCE_LEGAL_STATUSES,
  ATTENDANCE_TERMINATION_REASONS,
  type AttendanceEmployeeStatus,
  type AttendanceEmploymentType,
  type AttendanceLegalStatus,
  type AttendanceTerminationReason,
} from 'src/db/schema/attendance';

export class AttendanceEmploymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiProperty({
    enum: ATTENDANCE_EMPLOYMENT_TYPES,
    enumName: 'AttendanceEmploymentType',
  })
  employmentType: AttendanceEmploymentType;
  @ApiProperty({
    enum: ATTENDANCE_LEGAL_STATUSES,
    enumName: 'AttendanceLegalStatus',
  })
  legalStatus: AttendanceLegalStatus;
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  studentVacations: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  workPermits: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  pregnancyPeriods: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  nursingPeriods: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: String })
  indigenousHolidays: string[];
  @ApiPropertyOptional({ nullable: true, type: Number })
  regularLeaveWeekday: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  restDayWeekday: number | null;
  @ApiProperty() employmentInsuranceEligible: boolean;
  @ApiProperty() workPermitRequired: boolean;
  @ApiProperty() pensionApplicable: boolean;
  @ApiProperty() enabled: boolean;
  @ApiPropertyOptional({ nullable: true, type: String })
  birthDate: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  taiwanStaySince: string | null;
  @ApiProperty() hiredAt: Date;
  @ApiPropertyOptional() terminatedAt: Date | null;
  @ApiPropertyOptional({
    enum: ATTENDANCE_TERMINATION_REASONS,
    enumName: 'AttendanceTerminationReason',
    nullable: true,
  })
  terminationReason: AttendanceTerminationReason | null;
  @ApiPropertyOptional() terminationNoticedAt: Date | null;
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

export class AttendanceLegalStatusObligationResponseDto {
  @ApiProperty({
    enum: ATTENDANCE_LEGAL_STATUSES,
    enumName: 'AttendanceLegalStatus',
  })
  legalStatus: AttendanceLegalStatus;
  @ApiProperty() employmentInsuranceEligible: boolean;
  @ApiProperty() pensionApplicable: boolean;
  @ApiProperty() workPermitRequired: boolean;
}
