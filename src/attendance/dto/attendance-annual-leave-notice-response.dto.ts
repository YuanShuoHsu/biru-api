import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ATTENDANCE_ANNUAL_LEAVE_SETTLEMENTS,
  type AttendanceAnnualLeaveSettlement,
} from './attendance-annual-leave-notice-pagination-query.dto';

export class AttendanceAnnualLeaveNoticeLeaveDto {
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiProperty() leaveMinutes: number;
}

export class AttendanceAnnualLeaveNoticePayoutDto {
  @ApiProperty() month: string;
  @ApiPropertyOptional({
    description: '舊薪資單只記錄當月特休未休工資合計，沒有逐年度時數',
    nullable: true,
    type: Number,
  })
  unusedMinutes: number | null;
  @ApiProperty() amountCents: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  paidOn: string | null;
}

export class AttendanceAnnualLeaveNoticeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() employeeEmail: string;
  @ApiProperty() periodStart: Date;
  @ApiProperty() periodEnd: Date;
  @ApiProperty({ description: '特休年度尚未結束，未休為目前剩餘' })
  ongoing: boolean;
  @ApiPropertyOptional({
    description: '依勞基法 §38 III 寄出取得特休通知的時間',
    nullable: true,
    type: Date,
  })
  notifiedAt: Date | null;
  @ApiProperty() grantedMinutes: number;
  @ApiProperty() carriedInMinutes: number;
  @ApiProperty() usedMinutes: number;
  @ApiProperty() expiredMinutes: number;
  @ApiProperty() unusedMinutes: number;
  @ApiProperty() deferred: boolean;
  @ApiProperty({
    enum: ATTENDANCE_ANNUAL_LEAVE_SETTLEMENTS,
    enumName: 'AttendanceAnnualLeaveSettlement',
  })
  settlement: AttendanceAnnualLeaveSettlement;
  @ApiProperty({ isArray: true, type: AttendanceAnnualLeaveNoticeLeaveDto })
  leaves: AttendanceAnnualLeaveNoticeLeaveDto[];
  @ApiProperty({ isArray: true, type: AttendanceAnnualLeaveNoticePayoutDto })
  payouts: AttendanceAnnualLeaveNoticePayoutDto[];
}

export class AttendanceAnnualLeaveNoticesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceAnnualLeaveNoticeResponseDto })
  data: AttendanceAnnualLeaveNoticeResponseDto[];
  @ApiProperty() total: number;
}
