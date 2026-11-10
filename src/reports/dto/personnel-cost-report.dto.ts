import { ApiProperty } from '@nestjs/swagger';

import { Matches } from 'class-validator';

export class PersonnelCostReportQueryDto {
  @ApiProperty({ description: '薪資計算月份', example: '2026-10' })
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/)
  month: string;
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

  @ApiProperty({ isArray: true, type: PersonnelCostReportRowDto })
  rows: PersonnelCostReportRowDto[];

  @ApiProperty({ type: PersonnelCostReportTotalsDto })
  totals: PersonnelCostReportTotalsDto;

  @ApiProperty({ description: '當月在職但沒有已發布薪資單、未計入的員工數' })
  unpublishedEmployees: number;
}
