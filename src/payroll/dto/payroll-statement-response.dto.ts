import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  PAYROLL_BLOCKERS,
  PAYROLL_LINE_CODES,
  type PayrollBlocker,
  type PayrollLineCode,
} from 'src/db/schema/payroll';

import { PayrollTermsValuesDto } from './payroll-terms-response.dto';

export class PayrollLineResponseDto {
  @ApiProperty({ enum: PAYROLL_LINE_CODES, enumName: 'PayrollLineCode' })
  code: PayrollLineCode;
  @ApiProperty() amountCents: string;
  @ApiPropertyOptional() seconds?: number;
}

export class PayrollSnapshotResponseDto {
  @ApiProperty({ type: PayrollTermsValuesDto }) terms: PayrollTermsValuesDto;
  @ApiProperty() ruleVersion: string;
  @ApiProperty({ isArray: true, type: PayrollLineResponseDto })
  lines: PayrollLineResponseDto[];
  @ApiProperty() grossCents: string;
  @ApiProperty() deductionCents: string;
  @ApiProperty() netCents: string;
  @ApiProperty() employerPensionCents: string;
  @ApiProperty() workedSeconds: number;
  @ApiProperty({
    enum: PAYROLL_BLOCKERS,
    enumName: 'PayrollBlocker',
    isArray: true,
  })
  blockers: PayrollBlocker[];
  @ApiProperty() sourceFingerprint: string;
}

export class PayrollStatementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeName: string;
  @ApiProperty() month: string;
  @ApiProperty() version: number;
  @ApiProperty({
    enum: ['draft', 'reviewed', 'published'],
    enumName: 'PayrollStatementStatus',
  })
  status: string;
  @ApiProperty() idempotencyKey: string;
  @ApiProperty({ type: PayrollSnapshotResponseDto })
  snapshot: PayrollSnapshotResponseDto;
  @ApiProperty() reason: string;
  @ApiProperty() createdBy: string;
  @ApiPropertyOptional() reviewedBy: string | null;
  @ApiPropertyOptional() reviewedAt: Date | null;
  @ApiPropertyOptional() publishedAt: Date | null;
  @ApiPropertyOptional() reopenedBy: string | null;
  @ApiPropertyOptional() reopenedAt: Date | null;
  @ApiPropertyOptional() reopenReason: string | null;
  @ApiProperty() createdAt: Date;
}

export class PayrollStatementsResponseDto {
  @ApiProperty({ isArray: true, type: PayrollStatementResponseDto })
  data: PayrollStatementResponseDto[];
  @ApiProperty() total: number;
}
