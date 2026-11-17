import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';

import { IsIn, IsOptional, Matches } from 'class-validator';

import { ReportPageQueryDto } from './report-page-query.dto.js';

export class PersonnelCostReportQueryDto {
  @ApiProperty({ description: '薪資計算月份', example: '2026-10' })
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/)
  month: string;
}

export const PERSONNEL_COST_REPORT_STRING_FILTER_FIELDS = ['jobTitle'] as const;
export const PERSONNEL_COST_REPORT_NUMBER_FILTER_FIELDS = [
  'headcount',
  'grossCents',
  'employerInsuranceCents',
  'missingEmployerInsurance',
  'employerPensionCents',
  'totalCents',
] as const;
const PERSONNEL_COST_REPORT_FIELDS = [
  ...PERSONNEL_COST_REPORT_STRING_FILTER_FIELDS,
  ...PERSONNEL_COST_REPORT_NUMBER_FILTER_FIELDS,
] as const;
type PersonnelCostReportField = (typeof PERSONNEL_COST_REPORT_FIELDS)[number];

export class PersonnelCostReportPageQueryDto extends IntersectionType(
  PersonnelCostReportQueryDto,
  ReportPageQueryDto,
) {
  @ApiPropertyOptional({
    enum: PERSONNEL_COST_REPORT_FIELDS,
    enumName: 'PersonnelCostReportFilterField',
    description: '金額依數值比較',
  })
  @IsOptional()
  @IsIn(PERSONNEL_COST_REPORT_FIELDS)
  filterField?: PersonnelCostReportField;

  @ApiPropertyOptional({
    enum: PERSONNEL_COST_REPORT_FIELDS,
    enumName: 'PersonnelCostReportSortField',
    description: '金額依數值排序；省略時依職位排序，未設定職位的列在最後',
  })
  @IsOptional()
  @IsIn(PERSONNEL_COST_REPORT_FIELDS)
  sortBy?: PersonnelCostReportField;
}

export class PersonnelCostReportTotalsDto {
  @ApiProperty({ description: '已發布薪資單的人數' }) headcount: number;

  @ApiProperty({ description: '應發薪資（分）' }) grossCents: string;

  @ApiProperty({
    description:
      '雇主負擔的勞保、就保、健保、職災與工資墊償（分）；所有薪資單都沒有這筆資料時為 null',
    nullable: true,
    type: String,
  })
  employerInsuranceCents: string | null;

  @ApiProperty({ description: '沒有雇主勞健保資料、該項未計入的薪資單張數' })
  missingEmployerInsurance: number;

  @ApiProperty({ description: '雇主提繳勞退（分）' })
  employerPensionCents: string;

  @ApiProperty({ description: '以上三項中有資料者的合計（分）；不含補充保費' })
  totalCents: string;
}

class PersonnelCostReportRowDto extends PersonnelCostReportTotalsDto {
  @ApiProperty({
    description: '員工目前的職位；未設定為 null',
    nullable: true,
    type: String,
  })
  jobTitle: string | null;
}

export class PersonnelCostReportResponseDto {
  @ApiProperty() month: string;

  @ApiProperty({
    description: '本頁的列，套用篩選、排序與分頁後',
    isArray: true,
    type: PersonnelCostReportRowDto,
  })
  rows: PersonnelCostReportRowDto[];

  @ApiProperty({ description: '篩選後、分頁前的列數' })
  total: number;

  @ApiProperty({
    type: PersonnelCostReportTotalsDto,
    description: '整份報表的合計，不受篩選與分頁影響',
  })
  totals: PersonnelCostReportTotalsDto;

  @ApiProperty({
    description:
      '當月在職但沒有已發布薪資單、未計入的員工數；涵蓋整份報表，不受篩選與分頁影響',
  })
  unpublishedEmployees: number;
}
