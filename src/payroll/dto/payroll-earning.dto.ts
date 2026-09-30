import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  PAYROLL_EARNING_CATEGORIES,
  type PayrollEarningCategory,
} from 'src/db/schema/payroll';

export const PAYROLL_EARNING_TYPE_STRING_FILTER_FIELDS = ['name'] as const;

export const PAYROLL_EARNING_TYPE_ENUM_FILTER_FIELDS = ['category'] as const;

export const PAYROLL_EARNING_TYPE_FILTER_FIELDS = [
  ...PAYROLL_EARNING_TYPE_STRING_FILTER_FIELDS,
  ...PAYROLL_EARNING_TYPE_ENUM_FILTER_FIELDS,
] as const;

export type PayrollEarningTypeFilterField =
  (typeof PAYROLL_EARNING_TYPE_FILTER_FIELDS)[number];

export const PAYROLL_EARNING_TYPE_SORT_FIELDS =
  PAYROLL_EARNING_TYPE_FILTER_FIELDS;

export type PayrollEarningTypeSortField =
  (typeof PAYROLL_EARNING_TYPE_SORT_FIELDS)[number];

export class PayrollEarningTypePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PAYROLL_EARNING_TYPE_FILTER_FIELDS,
    enumName: 'PayrollEarningTypeFilterField',
  })
  @IsOptional()
  @IsIn(PAYROLL_EARNING_TYPE_FILTER_FIELDS)
  filterField?: PayrollEarningTypeFilterField;
  @ApiPropertyOptional({
    enum: PAYROLL_EARNING_TYPE_SORT_FIELDS,
    enumName: 'PayrollEarningTypeSortField',
  })
  @IsOptional()
  @IsIn(PAYROLL_EARNING_TYPE_SORT_FIELDS)
  sortBy?: PayrollEarningTypeSortField;
}

export class RenamePayrollEarningTypeDto {
  @IsString() @MinLength(1) @MaxLength(50) name: string;
}

export class CreatePayrollEarningTypeDto extends RenamePayrollEarningTypeDto {
  @ApiProperty({
    enum: PAYROLL_EARNING_CATEGORIES,
    enumName: 'PayrollEarningCategory',
  })
  @IsIn(PAYROLL_EARNING_CATEGORIES)
  category: PayrollEarningCategory;
}

export class PayrollEarningTypeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({
    enum: PAYROLL_EARNING_CATEGORIES,
    enumName: 'PayrollEarningCategory',
  })
  category: PayrollEarningCategory;
  @ApiProperty() inUse: boolean;
  @ApiProperty() createdAt: Date;
}

export class PayrollEarningTypesResponseDto {
  @ApiProperty({ isArray: true, type: PayrollEarningTypeResponseDto })
  data: PayrollEarningTypeResponseDto[];
  @ApiProperty() total: number;
}

export class PayrollEarningInputDto {
  @IsUUID() earningTypeId: string;
  @Matches(/^[1-9]\d{0,11}$/) amountCents: string;
}

export class PayrollEarningQueryDto {
  @IsUUID() employeeId: string;
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) month: string;
}
