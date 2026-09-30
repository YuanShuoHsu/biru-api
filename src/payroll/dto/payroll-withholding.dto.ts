import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
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

import {
  RESIDENCE_COUNTRY_CODES,
  type ResidenceCountryCode,
} from '../residence-countries';

export const WITHHOLDING_ID_TYPES = ['0', '3', '7'] as const;

export type WithholdingIdType = (typeof WITHHOLDING_ID_TYPES)[number];

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
  @ApiProperty({
    description:
      '本國籍為身分證統一編號；外籍為居留證統一證號，未住滿 183 天且無統一證號者為護照出生年月日加英文姓名前 2 字母',
  })
  @Matches(/^([A-Z][12A-D89]\d{8}|\d{8}[A-Z]{2})$/)
  taxId: string;
  @ApiProperty({ description: '戶籍地址；外籍無中文地址者填雇主地址' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  address: string;
  @ApiPropertyOptional({
    enum: RESIDENCE_COUNTRY_CODES,
    enumName: 'ResidenceCountryCode',
  })
  @IsOptional()
  @IsIn(RESIDENCE_COUNTRY_CODES)
  residenceCountryCode?: ResidenceCountryCode;
  @ApiPropertyOptional({ description: '居住地國稅務識別碼，無則填 NOTIN' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{1,30}$/)
  foreignTaxId?: string;
}

export class PayrollNonResidentFileQueryDto {
  @Matches(/^20\d{2}-\d{2}-\d{2}$/) paymentDate: string;
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
  @ApiProperty({ enum: WITHHOLDING_ID_TYPES, enumName: 'WithholdingIdType' })
  idType: WithholdingIdType;
  @ApiPropertyOptional({ nullable: true }) taxIdMasked: string | null;
  @ApiProperty() identityComplete: boolean;
  @ApiProperty() certificateRequested: boolean;
  @ApiProperty() periodFrom: string;
  @ApiProperty() periodTo: string;
  @ApiProperty() salaryCents: string;
  @ApiProperty() salaryWithholdingCents: string;
  @ApiProperty() voluntaryPensionCents: string;
  @ApiProperty() retirementIncomeCents: string;
  @ApiProperty() retirementWithholdingCents: string;
}

export class PayrollNonResidentPaymentResponseDto {
  @ApiProperty() paymentDate: string;
  @ApiProperty({ description: '代扣稅款之日起 10 日內' }) deadline: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiPropertyOptional({ nullable: true }) taxIdMasked: string | null;
  @ApiProperty() identityComplete: boolean;
  @ApiProperty() salaryCents: string;
  @ApiProperty() salaryWithholdingCents: string;
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
  @ApiProperty({ isArray: true, type: PayrollNonResidentPaymentResponseDto })
  nonResidentPayments: PayrollNonResidentPaymentResponseDto[];
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
  @ApiProperty({
    enum: ['annual', 'nonResident'],
    enumName: 'MyWithholdingCertificateKind',
  })
  kind: 'annual' | 'nonResident';
  @ApiProperty({ enum: WITHHOLDING_ID_TYPES, enumName: 'WithholdingIdType' })
  idType: WithholdingIdType;
  @ApiProperty() year: number;
  @ApiPropertyOptional({ nullable: true }) paymentDate: string | null;
  @ApiProperty({ description: '免填發的年度憑單可由員工申請填發' })
  requested: boolean;
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
