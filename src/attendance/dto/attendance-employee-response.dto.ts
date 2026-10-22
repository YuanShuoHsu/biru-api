import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { DatePeriodDto } from './save-attendance-employee.dto.js';

import {
  ATTENDANCE_EMPLOYEE_STATUSES,
  ATTENDANCE_EMPLOYMENT_TYPES,
  ATTENDANCE_LEGAL_STATUSES,
  ATTENDANCE_TERMINATION_REASONS,
  ATTENDANCE_WORK_PERMIT_STATUSES,
  type AttendanceEmployeeStatus,
  type AttendanceEmploymentType,
  type AttendanceLegalStatus,
  type AttendanceTerminationReason,
  type AttendanceWorkPermitStatus,
} from '../../db/schema/attendance.js';

export class AttendanceEmploymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
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
  @ApiProperty({ isArray: true, type: DatePeriodDto })
  childcareReductionPeriods: DatePeriodDto[];
  @ApiProperty({ isArray: true, type: String })
  indigenousHolidays: string[];
  @ApiPropertyOptional({ nullable: true, type: Number })
  regularLeaveWeekday: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  restDayWeekday: number | null;
  @ApiProperty() employmentInsuranceEligible: boolean;
  @ApiProperty({
    description: '報稅身分須填居留證號、居住地國與當地稅務識別碼',
  })
  foreignTaxIdentityRequired: boolean;
  @ApiProperty() workPermitRequired: boolean;
  @ApiProperty() pensionApplicable: boolean;
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

export class AttendanceEmployeeSummaryResponseDto extends PickType(
  AttendanceEmployeeResponseDto,
  [
    'id',
    'name',
    'email',
    'employmentType',
    'regularLeaveWeekday',
    'employmentInsuranceEligible',
    'pensionApplicable',
    'status',
  ] as const,
) {}

export class AttendanceEmployeesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceEmployeeSummaryResponseDto })
  data: AttendanceEmployeeSummaryResponseDto[];
  @ApiProperty() total: number;
}

export class AttendanceMemberEmploymentResponseDto extends PickType(
  AttendanceEmploymentResponseDto,
  [
    'id',
    'employmentType',
    'legalStatus',
    'workPermits',
    'employmentInsuranceEligible',
    'foreignTaxIdentityRequired',
    'workPermitRequired',
    'pensionApplicable',
    'hiredAt',
    'terminatedAt',
  ] as const,
) {}

export class AttendanceMemberResponseDto {
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty() joinedAt: Date;
  @ApiProperty({ description: '已設定且沒有任何出勤或薪資紀錄' })
  deletable: boolean;
  @ApiProperty({
    enum: ATTENDANCE_EMPLOYEE_STATUSES,
    enumName: 'AttendanceEmployeeStatus',
  })
  status: AttendanceEmployeeStatus;
  @ApiProperty({
    enum: ATTENDANCE_WORK_PERMIT_STATUSES,
    enumName: 'AttendanceWorkPermitStatus',
    nullable: true,
    description: '不需工作許可或已離職為 null',
  })
  workPermitStatus: AttendanceWorkPermitStatus | null;
  @ApiProperty({ type: Number, nullable: true })
  workPermitDaysLeft: number | null;
  @ApiPropertyOptional({
    nullable: true,
    type: AttendanceMemberEmploymentResponseDto,
  })
  employee: AttendanceMemberEmploymentResponseDto | null;
}

export class AttendanceMembersResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceMemberResponseDto })
  data: AttendanceMemberResponseDto[];
  @ApiProperty() total: number;
}

export class AttendanceSelfReviewAllowanceDto {
  @ApiProperty() attendanceRequest: boolean;
  @ApiProperty() leaveCase: boolean;
  @ApiProperty() parentalChild: boolean;
  @ApiProperty() parentalReturn: boolean;
  @ApiProperty() payslip: boolean;
}

export class AttendanceContextResponseDto {
  @ApiPropertyOptional({ type: AttendanceEmployeeResponseDto })
  employee: AttendanceEmployeeResponseDto | null;
  @ApiProperty() canManage: boolean;
  @ApiProperty() canManageSettings: boolean;
  @ApiProperty() canManagePayroll: boolean;
  @ApiProperty({
    description: '店內沒有其他人具備同一審核權限時，本人可處理自己的案件',
    type: AttendanceSelfReviewAllowanceDto,
  })
  selfReviewAllowed: AttendanceSelfReviewAllowanceDto;
}

export class AttendanceLegalStatusObligationResponseDto {
  @ApiProperty({
    enum: ATTENDANCE_LEGAL_STATUSES,
    enumName: 'AttendanceLegalStatus',
  })
  legalStatus: AttendanceLegalStatus;
  @ApiProperty() employmentInsuranceEligible: boolean;
  @ApiProperty({
    description: '報稅身分須填居留證號、居住地國與當地稅務識別碼',
  })
  foreignTaxIdentityRequired: boolean;
  @ApiProperty() pensionApplicable: boolean;
  @ApiProperty() workPermitRequired: boolean;
}
