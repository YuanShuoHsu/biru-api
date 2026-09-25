import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import { PayrollTermsDto, TaiwanInsuranceDto } from './payroll-terms.dto';

export class PayrollTermsValuesDto extends OmitType(PayrollTermsDto, [
  'employeeId',
  'effectiveFrom',
  'insurance',
] as const) {
  @ApiPropertyOptional({ type: TaiwanInsuranceDto })
  insurance?: TaiwanInsuranceDto;
}

export class PayrollTermsResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() effectiveFrom: Date;
  @ApiProperty() version: number;
  @ApiProperty({ type: PayrollTermsValuesDto }) terms: PayrollTermsValuesDto;
  @ApiProperty() createdAt: Date;
}
