import { ApiProperty, OmitType } from '@nestjs/swagger';

import { PayrollTermsDto } from './payroll-terms.dto';

export class PayrollTermsValuesDto extends OmitType(PayrollTermsDto, [
  'employeeId',
  'effectiveFrom',
] as const) {}

export class PayrollTermsResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() effectiveFrom: Date;
  @ApiProperty() version: number;
  @ApiProperty({ type: PayrollTermsValuesDto }) terms: PayrollTermsValuesDto;
  @ApiProperty() createdAt: Date;
}
