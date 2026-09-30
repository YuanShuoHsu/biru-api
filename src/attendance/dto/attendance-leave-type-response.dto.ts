import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  STATUTORY_LEAVE_KINDS,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';

export class AttendanceLeaveTypeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: STATUTORY_LEAVE_KINDS, enumName: 'StatutoryLeaveKind' })
  statutoryKind: StatutoryLeaveKind;
  @ApiProperty() eventLeave: boolean;
  @ApiProperty() calendarLeave: boolean;
  @ApiPropertyOptional({
    description:
      '產假、流產假等固定天數曆日假的法定天數，請假案件結束日由此推得',
    nullable: true,
    type: Number,
  })
  fixedCalendarDays: number | null;
  @ApiProperty() medicalCertificateRequired: boolean;
  @ApiPropertyOptional({ nullable: true }) paidPercent: number | null;
  @ApiPropertyOptional({ nullable: true }) statutoryPaidPercent: number | null;
  @ApiPropertyOptional({ nullable: true }) requiresBalance: boolean | null;
  @ApiProperty() enabled: boolean;
}

export class AttendanceLeaveTypesResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceLeaveTypeResponseDto })
  data: AttendanceLeaveTypeResponseDto[];
  @ApiProperty() total: number;
}
