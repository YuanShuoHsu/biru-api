import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  ATTENDANCE_LEGAL_STATUSES,
  type AttendanceLegalStatus,
} from 'src/db/schema/attendance';

export class PayrollWithholdingUnitDto {
  @Matches(/^\d{8}$/) businessNumber: string;
  @ApiProperty({ description: '國稅局分局、稽徵所或服務處代號' })
  @Matches(/^[A-Z]\d{2}$/)
  taxOfficeCode: string;
  @ApiProperty({ description: '扣繳單位稅籍編號' })
  @Matches(/^\d{4}[0-9FGHP]\d{4}$/)
  taxRegistrationNumber: string;
  @IsString() @MinLength(1) @MaxLength(50) name: string;
  @IsString() @MinLength(1) @MaxLength(26) address: string;
  @IsString() @MinLength(1) @MaxLength(50) agentName: string;
  @IsString() @MinLength(1) @MaxLength(20) representativeName: string;
  @IsString() @MinLength(1) @MaxLength(20) contactName: string;
  @Matches(/^[\d-]{1,15}$/) contactPhone: string;
  @IsEmail() @MaxLength(30) contactEmail: string;
}

export class PayrollTaxIdentityDto {
  @ApiProperty({ description: '國民身分證統一編號' })
  @Matches(/^[A-Z][12]\d{8}$/)
  taxId: string;
  @ApiProperty({ description: '戶籍地址' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  address: string;
}

export class PayrollWithholdingYearQueryDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year: number;
}

export class PayrollWithholdingCertificateResponseDto {
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty({
    enum: ATTENDANCE_LEGAL_STATUSES,
    enumName: 'AttendanceLegalStatus',
  })
  legalStatus: AttendanceLegalStatus;
  @ApiProperty({ description: '外籍員工目前需另行申報' }) filable: boolean;
  @ApiPropertyOptional({ nullable: true }) taxIdMasked: string | null;
  @ApiProperty() addressProvided: boolean;
  @ApiProperty() periodFrom: string;
  @ApiProperty() periodTo: string;
  @ApiProperty() salaryCents: string;
  @ApiProperty() salaryWithholdingCents: string;
  @ApiProperty() voluntaryPensionCents: string;
  @ApiProperty() retirementIncomeCents: string;
  @ApiProperty() retirementWithholdingCents: string;
}

export class PayrollWithholdingUnitResponseDto extends PayrollWithholdingUnitDto {}

export class PayrollWithholdingSummaryResponseDto {
  @ApiProperty() year: number;
  @ApiPropertyOptional({
    type: PayrollWithholdingUnitResponseDto,
    nullable: true,
  })
  unit: PayrollWithholdingUnitResponseDto | null;
  @ApiProperty({
    isArray: true,
    type: PayrollWithholdingCertificateResponseDto,
  })
  certificates: PayrollWithholdingCertificateResponseDto[];
}

export class PayrollWithholdingFileResponseDto {
  @ApiProperty() fileName: string;
  @ApiProperty() content: string;
}

export class MyWithholdingUnitResponseDto extends PickType(
  PayrollWithholdingUnitDto,
  ['businessNumber', 'name', 'address', 'agentName'] as const,
) {}

export class MyWithholdingCertificateResponseDto {
  @ApiProperty() year: number;
  @ApiProperty({ type: MyWithholdingUnitResponseDto })
  unit: MyWithholdingUnitResponseDto;
  @ApiProperty() employeeName: string;
  @ApiProperty() taxId: string;
  @ApiProperty() address: string;
  @ApiProperty() periodFrom: string;
  @ApiProperty() periodTo: string;
  @ApiProperty() salaryCents: string;
  @ApiProperty() salaryWithholdingCents: string;
  @ApiProperty() voluntaryPensionCents: string;
  @ApiProperty() retirementIncomeCents: string;
  @ApiProperty() retirementWithholdingCents: string;
}
