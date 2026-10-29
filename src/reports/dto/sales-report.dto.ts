import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsDateString, IsIn } from 'class-validator';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

const ORDER_SALES_REPORT_GROUP_BYS = [
  'day',
  'hour',
  'paymentMethod',
  'mode',
] as const;
export type OrderSalesReportGroupBy =
  (typeof ORDER_SALES_REPORT_GROUP_BYS)[number];

const ITEM_SALES_REPORT_GROUP_BYS = ['menuItem', 'category'] as const;
export type ItemSalesReportGroupBy =
  (typeof ITEM_SALES_REPORT_GROUP_BYS)[number];

export const SALES_REPORT_GROUP_BYS = [
  ...ORDER_SALES_REPORT_GROUP_BYS,
  ...ITEM_SALES_REPORT_GROUP_BYS,
] as const;
export type SalesReportGroupBy = (typeof SALES_REPORT_GROUP_BYS)[number];

export class SalesReportQueryDto {
  @ApiProperty({ description: '統計起始時間', format: 'date-time' })
  @IsDateString()
  since: string;

  @ApiProperty({
    description: '統計結束時間（不含）；須晚於 since，區間最多 366 天',
    format: 'date-time',
  })
  @IsDateString()
  until: string;

  @ApiProperty({
    enum: SALES_REPORT_GROUP_BYS,
    enumName: 'SalesReportGroupBy',
  })
  @IsIn(SALES_REPORT_GROUP_BYS)
  groupBy: SalesReportGroupBy;
}

export class SalesReportTotalsDto {
  @ApiProperty({ description: '計入時間落在區間內的計入訂單數' })
  orders: number;

  @ApiProperty({ description: '上述訂單的總額合計' })
  revenue: number;

  @ApiProperty({ description: '上述訂單的折扣合計' })
  discount: number;

  @ApiProperty({
    description:
      '退款時間落在區間內的確認退款金額；日／小時依退款時間歸組，付款方式／點餐方式依原訂單歸組，品項／分類依退款明細歸組',
  })
  refunded: number;

  @ApiProperty({ description: 'revenue 減 refunded' })
  net: number;
}

export class SalesReportRowDto extends SalesReportTotalsDto {
  @ApiProperty({
    description:
      'day：店家時區日期 YYYY-MM-DD；hour：店家時區小時 0–23；paymentMethod／mode：該列舉值；menuItem：品項 id；category：品項目前所屬菜單分類 id，品項已刪除或未分類為 uncategorized',
  })
  key: string;

  @ApiPropertyOptional({
    description:
      '僅 menuItem／category：目前的品項或分類名稱；品項已刪除時為最近一次訂單快照的預設語系名稱，未分類為 null',
    type: LocalizedTextDto,
    nullable: true,
  })
  name?: LocalizedText | null;

  @ApiPropertyOptional({
    description: '僅 menuItem／category：售出份數，含被加購的次數',
  })
  quantity?: number;

  @ApiPropertyOptional({
    description: '僅 menuItem／category：退款時間落在區間內的退款份數',
  })
  refundedQuantity?: number;
}

export class SalesReportResponseDto {
  @ApiProperty({
    enum: SALES_REPORT_GROUP_BYS,
    enumName: 'SalesReportGroupBy',
  })
  groupBy: SalesReportGroupBy;

  @ApiProperty({
    description:
      '只列有訂單或退款的組；day／hour 依 key 由小到大，其餘依 revenue 由大到小。menuItem／category 的金額依品項小計分攤整單折扣、依退款明細分攤退款，加購計入加購品項，四捨五入到分，總和可能與 totals 差幾分',
    type: [SalesReportRowDto],
  })
  rows: SalesReportRowDto[];

  @ApiProperty({ type: SalesReportTotalsDto })
  totals: SalesReportTotalsDto;
}
