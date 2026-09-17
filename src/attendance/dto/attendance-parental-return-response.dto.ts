import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

export class AttendanceParentalReturnResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() requestId: string;
  @ApiProperty() originalStartsAt: Date;
  @ApiProperty() originalEndsAt: Date;
  @ApiProperty() returnsAt: Date;
  @ApiProperty({
    enum: ['pending', 'approved', 'rejected', 'withdrawn'],
    enumName: 'AttendanceParentalReturnStatus',
  })
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  @ApiProperty() reason: string;
  @ApiPropertyOptional() reviewReason: string | null;
  @ApiPropertyOptional() reviewedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AttendanceParentalReturnRecordResponseDto extends OmitType(
  AttendanceParentalReturnResponseDto,
  ['employeeName'] as const,
) {}

export class AttendanceParentalReturnsResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceParentalReturnResponseDto })
  data: AttendanceParentalReturnResponseDto[];
  @ApiProperty() total: number;
}
