import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';

import { IsIn, IsNumberString, IsOptional, Matches } from 'class-validator';

import {
  operatingCostCategoryEnum,
  type OperatingCostCategory,
} from '../../db/schema/operating-costs.js';
import { MONTH_PATTERN } from '../../operating-costs/dto/operating-cost.dto.js';

import { ReportPageQueryDto } from './report-page-query.dto.js';

export class BreakEvenReportQueryDto {
  @ApiProperty({ description: '月份（台灣時間）', example: '2026-12' })
  @Matches(MONTH_PATTERN)
  month: string;

  @ApiPropertyOptional({
    example: '50000',
    description:
      '目標稅後淨利（每月）；帶了才算目標營業額，換算稅前時營所稅依全年化估算',
  })
  @IsOptional()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  @IsNumberString()
  targetProfit?: string;
}

export const BREAK_EVEN_ITEM_STRING_FILTER_FIELDS = ['name'] as const;
export const BREAK_EVEN_ITEM_NUMBER_FILTER_FIELDS = [
  'quantity',
  'revenue',
  'cost',
  'grossProfit',
  'grossMarginRate',
] as const;
const BREAK_EVEN_ITEM_FIELDS = [
  ...BREAK_EVEN_ITEM_STRING_FILTER_FIELDS,
  ...BREAK_EVEN_ITEM_NUMBER_FILTER_FIELDS,
] as const;
type BreakEvenItemField = (typeof BREAK_EVEN_ITEM_FIELDS)[number];

export class BreakEvenReportPageQueryDto extends IntersectionType(
  BreakEvenReportQueryDto,
  ReportPageQueryDto,
) {
  @ApiPropertyOptional({
    enum: BREAK_EVEN_ITEM_FIELDS,
    enumName: 'BreakEvenItemFilterField',
  })
  @IsOptional()
  @IsIn(BREAK_EVEN_ITEM_FIELDS)
  filterField?: BreakEvenItemField;

  @ApiPropertyOptional({
    enum: BREAK_EVEN_ITEM_FIELDS,
    enumName: 'BreakEvenItemSortField',
    description: '省略時依未稅營收高到低',
  })
  @IsOptional()
  @IsIn(BREAK_EVEN_ITEM_FIELDS)
  sortBy?: BreakEvenItemField;
}

export const PERSONNEL_COST_SOURCES = [
  'payroll',
  'schedule',
  'estimate',
  'none',
] as const;
export type PersonnelCostSource = (typeof PERSONNEL_COST_SOURCES)[number];

export const COST_RATE_SOURCES = ['sales', 'menu'] as const;
export type CostRateSource = (typeof COST_RATE_SOURCES)[number];
export class BreakEvenFixedCostDto {
  @ApiProperty({
    enum: operatingCostCategoryEnum.enumValues,
    enumName: 'OperatingCostCategory',
  })
  category: OperatingCostCategory;

  @ApiProperty({
    description: '這個月採用的設定的生效月份；人事來自薪資單時為 null',
    nullable: true,
    type: String,
  })
  effectiveFrom: string | null;

  @ApiProperty({ description: '當月金額（實付，含稅）' }) amount: number;

  @ApiProperty({
    description:
      '其中可扣抵的進項稅：設為有統一發票時為金額 ÷ 1.05 × 5%，否則 0',
  })
  inputTax: number;
}

export class BreakEvenPersonnelDto {
  @ApiProperty({
    enum: PERSONNEL_COST_SOURCES,
    enumName: 'PersonnelCostSource',
    description:
      'payroll：當月在職員工都有已發布薪資單；schedule：沒有已發布薪資單的員工依班表與薪資設定試算；estimate：沒有任何員工算得出，改用固定成本裡的人事預估；none：三者皆無',
  })
  source: PersonnelCostSource;

  @ApiProperty({
    description:
      '應發薪資＋雇主勞健保＋雇主勞退提繳；已發布薪資單用實際金額，其餘用試算',
  })
  amount: number;

  @ApiProperty({ description: '有已發布薪資單的員工數' })
  publishedEmployees: number;

  @ApiProperty({ description: '沒有已發布薪資單、依班表試算的員工數' })
  scheduledEmployees: number;

  @ApiProperty({
    description:
      '沒有已發布薪資單、也試算不出（例如缺薪資設定或當月費率表）而未計入的員工數',
  })
  unestimatedEmployees: number;
}

export class BreakEvenItemRowDto {
  @ApiProperty() menuItemId: string;

  @ApiProperty({ description: '品項名稱（依請求語系）' }) name: string;

  @ApiProperty({ description: '淨售出份數（扣除退款份數）' })
  quantity: number;

  @ApiProperty({ description: '未稅淨營收（扣除折扣與退款）' })
  revenue: number;

  @ApiProperty({
    description:
      '依食譜與目前進價算出的標準成本，含品項、加購與客製選項的食譜；品項沒有食譜或食譜有未定價的食材時為 null',
    nullable: true,
    type: Number,
  })
  cost: number | null;

  @ApiProperty({ nullable: true, type: Number }) grossProfit: number | null;

  @ApiProperty({
    description: '毛利率（0–1）；成本未知或未稅營收為 0 時為 null',
    nullable: true,
    type: Number,
  })
  grossMarginRate: number | null;
}

export class BreakEvenReportResponseDto {
  @ApiProperty() month: string;

  @ApiProperty({ description: '當月營業日數，依營業時間與特殊營業時間' })
  openDays: number;

  @ApiProperty({
    description: '當月剩餘營業日數，含今天；過去的月份為 0',
  })
  remainingOpenDays: number;

  @ApiProperty({
    description: '每個類別當月採用的固定成本，不含人事',
    isArray: true,
    type: BreakEvenFixedCostDto,
  })
  fixedCosts: BreakEvenFixedCostDto[];

  @ApiProperty({ type: BreakEvenPersonnelDto })
  personnel: BreakEvenPersonnelDto;

  @ApiProperty({ description: '固定成本合計（扣除可扣抵進項稅後），含人事' })
  fixedCostTotal: number;

  @ApiProperty({ description: '含稅淨營業額（營收扣除退款）' })
  revenue: number;

  @ApiProperty({ description: '銷項稅額：含稅淨營業額 ÷ 1.05 × 5%' })
  outputTax: number;

  @ApiProperty({
    description:
      '可扣抵的進項稅額：有統一發票的固定成本、開立統一發票的供應商食材（依當月銷貨成本）與金流手續費所含的 5%',
  })
  inputTax: number;

  @ApiProperty({
    description:
      '估計應納營業稅：銷項稅額 − 進項稅額；負數為留抵稅額。實際依進貨發票申報',
  })
  businessTaxPayable: number;

  @ApiProperty({ description: '未稅淨營業額' })
  salesExcludingTax: number;

  @ApiProperty({
    description:
      '當月可算出成本的品項的標準成本合計；開立統一發票的供應商以未稅進價計算',
  })
  costOfGoodsSold: number;

  @ApiProperty({
    description: '當月有銷售但算不出成本、未計入銷貨成本的品項數',
  })
  unpricedItems: number;

  @ApiProperty({
    description:
      '當月金流手續費：綠界回報的交易服務金額（手續費＋處理費）合計，現金為 0',
  })
  paymentFees: number;

  @ApiProperty({
    description: '當月經綠界付款、但沒有手續費資料而未計入手續費的訂單數',
  })
  unknownFeeOrders: number;

  @ApiProperty({
    description: '計算變動成本率與手續費率的期間起日（台灣時間，含）',
    example: '2026-09-02',
  })
  rateSince: string;

  @ApiProperty({
    description:
      '計算變動成本率與手續費率的期間迄日（台灣時間，含）；當月取到今天，過去月份取到月底',
    example: '2026-11-30',
  })
  rateUntil: string;

  @ApiProperty({
    enum: COST_RATE_SOURCES,
    enumName: 'CostRateSource',
    nullable: true,
    description:
      'sales：期間內可算出成本的實際銷售；menu：期間內沒有這樣的銷售，改用菜單上有食譜成本與售價的品項平均；兩者皆無為 null',
  })
  costRateSource: CostRateSource | null;

  @ApiProperty({
    description: '變動成本率：銷貨成本 ÷ 未稅營收，來源見 costRateSource',
    nullable: true,
    type: Number,
  })
  costOfGoodsSoldRate: number | null;

  @ApiProperty({
    description: '毛利率：1 − 變動成本率',
    nullable: true,
    type: Number,
  })
  grossMarginRate: number | null;

  @ApiProperty({
    description:
      '手續費率：期間內有手續費資料的訂單的手續費 ÷ 含稅營業額（現金訂單計 0）；沒有資料時為 null，損益平衡不計手續費',
    nullable: true,
    type: Number,
  })
  paymentFeeRate: number | null;

  @ApiProperty({
    description:
      '損益平衡點（含稅營業額）：固定成本 ÷ 每元含稅營業額的邊際貢獻（(1 − 變動成本率 − 手續費率) ÷ 1.05）；變動成本率未知或沒有邊際貢獻時為 null',
    nullable: true,
    type: Number,
  })
  breakEvenRevenue: number | null;

  @ApiProperty({
    description: '每日需求營業額：損益平衡點 ÷ 營業日數',
    nullable: true,
    type: Number,
  })
  dailyBreakEvenRevenue: number | null;

  @ApiProperty({
    description:
      '剩餘每日需求營業額：（損益平衡點 − 已達成營業額）÷ 剩餘營業日數；沒有剩餘營業日（過去的月份）時為 null',
    nullable: true,
    type: Number,
  })
  remainingDailyBreakEvenRevenue: number | null;

  @ApiProperty({
    description: '目標稅後淨利（每月）',
    nullable: true,
    type: Number,
  })
  targetProfit: number | null;

  @ApiProperty({
    description: '要留下目標稅後淨利所需的稅前淨利',
    nullable: true,
    type: Number,
  })
  targetPreTaxProfit: number | null;

  @ApiProperty({
    description:
      '目標淨利營業額（含稅）：（固定成本 + 目標稅前淨利）÷ 邊際貢獻',
    nullable: true,
    type: Number,
  })
  targetRevenue: number | null;

  @ApiProperty({ nullable: true, type: Number })
  dailyTargetRevenue: number | null;

  @ApiProperty({
    description:
      '稅前淨利：未稅淨營業額 − 銷貨成本 − 未稅手續費 − 固定成本（皆扣除可扣抵進項稅）',
  })
  preTaxProfit: number;

  @ApiProperty({
    description:
      '預估營所稅：把當月稅前淨利乘 12 依所得稅法第 5 條算出全年稅額再除以 12；虧損為 0',
  })
  incomeTax: number;

  @ApiProperty({ description: '稅後淨利：稅前淨利 − 預估營所稅' })
  afterTaxProfit: number;

  @ApiProperty({
    description: '品項毛利，本頁的列，套用篩選、排序與分頁後',
    isArray: true,
    type: BreakEvenItemRowDto,
  })
  rows: BreakEvenItemRowDto[];

  @ApiProperty({ description: '篩選後、分頁前的品項數' })
  total: number;
}
