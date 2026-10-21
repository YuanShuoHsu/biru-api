import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty() periodStart: Date;
  @ApiProperty() periodEnd: Date;
  @ApiProperty() grantedMinutes: number;
  @ApiProperty() carriedInMinutes: number;
  @ApiProperty() usedMinutes: number;
  @ApiProperty() expiredMinutes: number;
  @ApiProperty() unusedMinutes: number;
  @ApiProperty() deferred: boolean;
  @ApiProperty({ isArray: true, type: AttendanceAnnualLeaveNoticeLeaveDto })
  leaves: AttendanceAnnualLeaveNoticeLeaveDto[];
  @ApiProperty({ isArray: true, type: AttendanceAnnualLeaveNoticePayoutDto })
  payouts: AttendanceAnnualLeaveNoticePayoutDto[];
}
