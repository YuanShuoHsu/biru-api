import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const PAYROLL_STATEMENT_STRING_FILTER_FIELDS = [
  'employeeName',
  'employeeEmail',
] as const;

export const PAYROLL_STATEMENT_MONTH_FILTER_FIELDS = ['month'] as const;

export const PAYROLL_STATEMENT_ENUM_FILTER_FIELDS = ['status'] as const;
const PAYROLL_STATEMENT_FILTER_FIELDS = [
  ...PAYROLL_STATEMENT_STRING_FILTER_FIELDS,
  ...PAYROLL_STATEMENT_MONTH_FILTER_FIELDS,
  ...PAYROLL_STATEMENT_ENUM_FILTER_FIELDS,
] as const;

type PayrollStatementFilterField =
  (typeof PAYROLL_STATEMENT_FILTER_FIELDS)[number];
const PAYROLL_STATEMENT_SORT_FIELDS = PAYROLL_STATEMENT_FILTER_FIELDS;
type PayrollStatementSortField = (typeof PAYROLL_STATEMENT_SORT_FIELDS)[number];

export class PayrollStatementPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PAYROLL_STATEMENT_FILTER_FIELDS,
    enumName: 'PayrollStatementFilterField',
  })
  @IsOptional()
  @IsIn(PAYROLL_STATEMENT_FILTER_FIELDS)
  filterField?: PayrollStatementFilterField;
  @ApiPropertyOptional({
    enum: PAYROLL_STATEMENT_SORT_FIELDS,
    enumName: 'PayrollStatementSortField',
  })
  @IsOptional()
  @IsIn(PAYROLL_STATEMENT_SORT_FIELDS)
  sortBy?: PayrollStatementSortField;
}
