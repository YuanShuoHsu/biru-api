import { ApiProperty } from '@nestjs/swagger';

import { IsDateString, IsIn } from 'class-validator';

export const SALES_REPORT_GROUP_BYS = [
  'day',
  'hour',
  'paymentMethod',
  'mode',
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
      '退款時間落在區間內的確認退款金額；日／小時依退款時間歸組，付款方式／點餐方式依原訂單歸組',
  })
  refunded: number;

  @ApiProperty({ description: 'revenue 減 refunded' })
  net: number;
}

export class SalesReportRowDto extends SalesReportTotalsDto {
  @ApiProperty({
    description:
      'day：店家時區日期 YYYY-MM-DD；hour：店家時區小時 0–23；paymentMethod／mode：該列舉值',
  })
  key: string;
}

export class SalesReportResponseDto {
  @ApiProperty({
    enum: SALES_REPORT_GROUP_BYS,
    enumName: 'SalesReportGroupBy',
  })
  groupBy: SalesReportGroupBy;

  @ApiProperty({
    description:
      '只列有訂單或退款的組；day／hour 依 key 由小到大，paymentMethod／mode 依 revenue 由大到小',
    type: [SalesReportRowDto],
  })
  rows: SalesReportRowDto[];

  @ApiProperty({ type: SalesReportTotalsDto })
  totals: SalesReportTotalsDto;
}
