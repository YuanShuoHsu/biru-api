import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  PAYROLL_BLOCKERS,
  PAYROLL_DEDUCTION_LINE_CODES,
  PAYROLL_EARNING_LINE_CODES,
  PAYROLL_EMPLOYER_COST_CODES,
  type PayrollBlocker,
  type PayrollDeductionLineCode,
  type PayrollEarningLineCode,
  type PayrollEmployerCostCode,
  type PayrollLine,
  type PayrollLineCode,
  type payrollStatement,
} from 'src/db/schema/payroll';

import { PayrollTermsValuesDto } from './payroll-terms-response.dto';

export class PayrollEarningLineResponseDto {
  @ApiProperty({
    enum: PAYROLL_EARNING_LINE_CODES,
    enumName: 'PayrollEarningLineCode',
  })
  code: PayrollEarningLineCode;
  @ApiProperty() amountCents: string;
  @ApiPropertyOptional() seconds?: number;
}

export class PayrollDeductionLineResponseDto {
  @ApiProperty({
    enum: PAYROLL_DEDUCTION_LINE_CODES,
    enumName: 'PayrollDeductionLineCode',
  })
  code: PayrollDeductionLineCode;
  @ApiProperty() amountCents: string;
  @ApiPropertyOptional() seconds?: number;
}

export class PayrollEmployerCostResponseDto {
  @ApiProperty({
    enum: PAYROLL_EMPLOYER_COST_CODES,
    enumName: 'PayrollEmployerCostCode',
  })
  code: PayrollEmployerCostCode;
  @ApiProperty() amountCents: string;
}

export class PayrollSnapshotResponseDto {
  @ApiProperty({ type: PayrollTermsValuesDto }) terms: PayrollTermsValuesDto;
  @ApiProperty() ruleVersion: string;
  @ApiProperty({ isArray: true, type: PayrollEarningLineResponseDto })
  earnings: PayrollEarningLineResponseDto[];
  @ApiProperty({ isArray: true, type: PayrollDeductionLineResponseDto })
  deductions: PayrollDeductionLineResponseDto[];
  @ApiProperty() grossCents: string;
  @ApiProperty() deductionCents: string;
  @ApiProperty() netCents: string;
  @ApiProperty() employerPensionCents: string;
  @ApiPropertyOptional({ isArray: true, type: PayrollEmployerCostResponseDto })
  employerCosts?: PayrollEmployerCostResponseDto[];
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
  @ApiProperty() createdAt: Date;
}

export class PayrollStatementsResponseDto {
  @ApiProperty({ isArray: true, type: PayrollStatementResponseDto })
  data: PayrollStatementResponseDto[];
  @ApiProperty() total: number;
}

const isEarningLine = (
  line: PayrollLine,
): line is PayrollLine & { code: PayrollEarningLineCode } =>
  (PAYROLL_EARNING_LINE_CODES as readonly PayrollLineCode[]).includes(
    line.code,
  );

const isDeductionLine = (
  line: PayrollLine,
): line is PayrollLine & { code: PayrollDeductionLineCode } =>
  (PAYROLL_DEDUCTION_LINE_CODES as readonly PayrollLineCode[]).includes(
    line.code,
  );

export const toPayrollStatementResponse = ({
  snapshot: { lines, ...snapshot },
  ...statement
}: typeof payrollStatement.$inferSelect): PayrollStatementResponseDto => ({
  ...statement,
  snapshot: {
    ...snapshot,
    earnings: lines.filter(isEarningLine),
    deductions: lines.filter(isDeductionLine),
  },
});
