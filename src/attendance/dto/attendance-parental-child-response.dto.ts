import { ApiProperty, OmitType } from '@nestjs/swagger';

export class AttendanceParentalChildResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() reference: string;
  @ApiProperty() label: string;
  @ApiProperty() birthDate: Date;
  @ApiProperty() createdAt: Date;
}

export class AttendanceParentalChildRecordResponseDto extends OmitType(
  AttendanceParentalChildResponseDto,
  ['employeeName'] as const,
) {}

export class AttendanceParentalChildrenResponseDto {
  @ApiProperty({ isArray: true, type: AttendanceParentalChildResponseDto })
  data: AttendanceParentalChildResponseDto[];
  @ApiProperty() total: number;
}
