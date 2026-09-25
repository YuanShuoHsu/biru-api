import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WithholdingBracketResponseDto {
  @ApiPropertyOptional({ nullable: true, type: Number }) upTo: number | null;
  @ApiProperty() rateBp: number;
}

export class WithholdingTableResponseDto {
  @ApiProperty() year: number;
  @ApiProperty() exemption: number;
  @ApiProperty() standardDeduction: number;
  @ApiProperty() salaryDeduction: number;
  @ApiProperty({ isArray: true, type: WithholdingBracketResponseDto })
  brackets: WithholdingBracketResponseDto[];
  @ApiProperty() retirementExemptPerYear: number;
  @ApiProperty() retirementHalfTaxablePerYear: number;
}

export class TaiwanRuleSetResponseDto {
  @ApiProperty() laborPercentBp: number;
  @ApiProperty() employmentPercentBp: number;
  @ApiProperty() healthPercentBp: number;
  @ApiProperty() laborEmployeeShareBp: number;
  @ApiProperty() laborEmployerShareBp: number;
  @ApiProperty() healthEmployeeShareBp: number;
  @ApiProperty() healthEmployerShareBp: number;
  @ApiProperty() healthAverageDependentsBp: number;
  @ApiProperty() commutingAccidentRateMicros: number;
  @ApiProperty() wageGuaranteeRateMicros: number;
  @ApiProperty() withholdingRateBp: number;
  @ApiProperty() withholdingExemptTaxCents: string;
  @ApiProperty({ type: WithholdingTableResponseDto })
  withholdingTable: WithholdingTableResponseDto;
  @ApiProperty() healthSupplementRateBp: number;
  @ApiProperty({ type: [Number] }) laborGrades: number[];
  @ApiProperty({ type: [Number] }) partTimeLaborGrades: number[];
  @ApiProperty({ type: [Number] }) occupationalGrades: number[];
  @ApiProperty({ type: [Number] }) pensionGrades: number[];
  @ApiProperty({ type: [Number] }) healthGrades: number[];
  @ApiProperty() minimumMonthlyWageCents: string;
  @ApiProperty() minimumHourlyWageCents: string;
}

export class PayrollRuleSourceResponseDto {
  @ApiProperty() label: string;
  @ApiProperty() url: string;
}

export class PayrollRuleSetResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() jurisdiction: string;
  @ApiProperty() effectiveFrom: string;
  @ApiProperty() ruleVersion: string;
  @ApiProperty({ type: TaiwanRuleSetResponseDto })
  rules: TaiwanRuleSetResponseDto;
  @ApiProperty() origin: string;
  @ApiProperty({ isArray: true, type: PayrollRuleSourceResponseDto })
  sources: PayrollRuleSourceResponseDto[];
  @ApiPropertyOptional() ratesCarriedFrom: string | null;
  @ApiPropertyOptional() fetchedAt: Date | null;
  @ApiPropertyOptional() checkedAt: Date | null;
  @ApiProperty({ enum: ['minimumHourlyWageCents'], isArray: true })
  unconfirmed: (keyof TaiwanRuleSetResponseDto)[];
  @ApiProperty() createdAt: Date;
}

export class PayrollRuleIngestResponseDto {
  @ApiProperty({ type: [String] }) written: string[];
  @ApiProperty({ type: [String] }) skipped: string[];
  @ApiProperty({ type: [String] }) rejected: string[];
  @ApiProperty() checked: boolean;
}
