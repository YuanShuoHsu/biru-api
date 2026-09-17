import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TaiwanInsuranceDto {
  @ApiProperty({
    enum: ['both', 'labor', 'employment', 'none'],
    enumName: 'PayrollLaborCoverage',
  })
  @IsIn(['both', 'labor', 'employment', 'none'])
  laborCoverage: 'both' | 'labor' | 'employment' | 'none';
  @ApiProperty({
    enum: ['general', 'partTime'],
    enumName: 'PayrollLaborLadder',
    required: false,
  })
  @IsOptional()
  @IsIn(['general', 'partTime'])
  laborLadder?: 'general' | 'partTime';
  @IsInt() @Min(0) laborBasis: number;
  @IsInt() @Min(0) healthBasis: number;
  @IsInt() @Min(0) @Max(20) healthDependents: number;
  @IsInt() @Min(0) @Max(150000) pensionBasis: number;
  @IsInt() @Min(0) @Max(6) voluntaryPercent: number;
  @IsInt() @Min(6) @Max(100) employerPercent: number;
  @ApiProperty({
    enum: ['resident5', 'verified'],
    enumName: 'PayrollTaxMethod',
  })
  @IsIn(['resident5', 'verified'])
  taxMethod: 'resident5' | 'verified';
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
  @IsOptional() @IsInt() @Min(1) @Max(744) allowanceHours?: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => TaiwanInsuranceDto)
  insurance?: TaiwanInsuranceDto;
  @IsUUID() employeeId: string;
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])-01$/) effectiveFrom: string;
  @ApiProperty({ enum: ['monthly', 'hourly'], enumName: 'PayrollSalaryType' })
  @IsIn(['monthly', 'hourly'])
  salaryType: 'monthly' | 'hourly';
  @Matches(/^\d{1,12}$/) salaryCents: string;
  @Matches(/^\d{1,12}$/) laborInsuranceCents: string;
  @Matches(/^\d{1,12}$/) healthInsuranceCents: string;
  @Matches(/^\d{1,12}$/) voluntaryPensionCents: string;
  @Matches(/^\d{1,12}$/) employerPensionCents: string;
  @Matches(/^\d{1,12}$/) withholdingCents: string;
  @Matches(/^\d{1,12}$/) allowanceCents: string;
  @Matches(/^\d{1,12}$/) otherDeductionCents: string;
  @IsString() @MinLength(1) @MaxLength(2000) sourceNote: string;
}
