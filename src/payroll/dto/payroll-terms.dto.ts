import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  EMPLOYMENT_INSURANCE_EXEMPTIONS,
  type EmploymentInsuranceExemption,
  HEALTH_INSURANCE_EXEMPTIONS,
  HEALTH_SUPPLEMENT_EXEMPTIONS,
  type HealthInsuranceExemption,
  type HealthSupplementExemption,
  LABOR_INSURANCE_EXEMPTIONS,
  type LaborInsuranceExemption,
  PAYROLL_TAX_METHODS,
  type PayrollTaxMethod,
} from 'src/db/schema/payroll';

export class TaiwanInsuranceDto {
  @ApiProperty({
    enum: ['both', 'labor', 'employment', 'none'],
    enumName: 'PayrollLaborCoverage',
  })
  @IsIn(['both', 'labor', 'employment', 'none'])
  laborCoverage: 'both' | 'labor' | 'employment' | 'none';
  @ApiProperty({
    enum: LABOR_INSURANCE_EXEMPTIONS,
    enumName: 'PayrollLaborInsuranceExemption',
    required: false,
  })
  @IsOptional()
  @IsIn(LABOR_INSURANCE_EXEMPTIONS)
  laborInsuranceExemption?: LaborInsuranceExemption;
  @ApiProperty({
    enum: HEALTH_INSURANCE_EXEMPTIONS,
    enumName: 'PayrollHealthInsuranceExemption',
    required: false,
  })
  @IsOptional()
  @IsIn(HEALTH_INSURANCE_EXEMPTIONS)
  healthInsuranceExemption?: HealthInsuranceExemption;
  @ApiProperty({
    enum: EMPLOYMENT_INSURANCE_EXEMPTIONS,
    enumName: 'PayrollEmploymentInsuranceExemption',
    required: false,
  })
  @IsOptional()
  @IsIn(EMPLOYMENT_INSURANCE_EXEMPTIONS)
  employmentInsuranceExemption?: EmploymentInsuranceExemption;
  @ApiProperty({
    enum: HEALTH_SUPPLEMENT_EXEMPTIONS,
    enumName: 'PayrollHealthSupplementExemption',
    required: false,
  })
  @IsOptional()
  @IsIn(HEALTH_SUPPLEMENT_EXEMPTIONS)
  healthSupplementExemption?: HealthSupplementExemption;
  @ApiProperty({
    enum: ['general', 'partTime'],
    enumName: 'PayrollLaborLadder',
    required: false,
  })
  @IsOptional()
  @IsIn(['general', 'partTime'])
  laborLadder?: 'general' | 'partTime';
  @IsInt() @Min(0) laborBasis: number;
  @IsInt() @Min(1) occupationalBasis: number;
  @IsInt() @Min(0) healthBasis: number;
  @IsInt() @Min(0) @Max(20) healthDependents: number;
  @IsInt() @Min(0) @Max(150000) pensionBasis: number;
  @IsInt() @Min(0) @Max(6) voluntaryPercent: number;
  @IsInt() @Min(0) @Max(100) employerPercent: number;
  @ApiProperty({ enum: PAYROLL_TAX_METHODS, enumName: 'PayrollTaxMethod' })
  @IsIn(PAYROLL_TAX_METHODS)
  taxMethod: PayrollTaxMethod;
  @IsInt() @Min(0) @Max(99) withholdingDependents: number;
  @ApiPropertyOptional() voluntaryHealthInsurance?: boolean;
}

export class TaiwanInsuranceInputDto extends PickType(TaiwanInsuranceDto, [
  'laborInsuranceExemption',
  'healthInsuranceExemption',
  'employmentInsuranceExemption',
  'healthSupplementExemption',
  'healthDependents',
  'voluntaryPercent',
  'employerPercent',
  'taxMethod',
  'withholdingDependents',
] as const) {
  @ApiProperty({
    description: '每週工時未達法定投保門檻時仍在本店投保健保；達門檻者一律投保',
  })
  @IsBoolean()
  voluntaryHealthInsurance: boolean;
}

export class PayrollTermsDto {
  @ApiProperty({
    enum: ['thirtyDays', 'calendarDays'],
    enumName: 'PayrollMonthlyProration',
    required: false,
  })
  @IsOptional()
  @IsIn(['thirtyDays', 'calendarDays'])
  monthlyProration?: 'thirtyDays' | 'calendarDays';
  @IsDefined()
  @ValidateNested()
  @Type(() => TaiwanInsuranceInputDto)
  insurance: TaiwanInsuranceInputDto;
  @IsUUID() employeeId: string;
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])-01$/) effectiveFrom: string;
  @ApiProperty({ enum: ['monthly', 'hourly'], enumName: 'PayrollSalaryType' })
  @IsIn(['monthly', 'hourly'])
  salaryType: 'monthly' | 'hourly';
  @Matches(/^\d{1,12}$/) salaryCents: string;
  @Matches(/^\d{1,12}$/) allowanceCents: string;
  @Matches(/^\d{1,12}$/) otherDeductionCents: string;
  @IsOptional() @IsString() @MaxLength(2000) sourceNote?: string;
}
