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
