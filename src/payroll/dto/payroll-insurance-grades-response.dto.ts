import { ApiProperty } from '@nestjs/swagger';

export class PayrollInsuranceGradesResponseDto {
  @ApiProperty() effectiveFrom: string;
  @ApiProperty({ type: [Number] }) laborGrades: number[];
  @ApiProperty({ type: [Number] }) partTimeLaborGrades: number[];
  @ApiProperty({ type: [Number] }) healthGrades: number[];
}
