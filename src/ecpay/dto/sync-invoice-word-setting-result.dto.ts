import { IsDefined, IsIn, IsOptional, IsString } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 綠界的期別；查詢用的 0（全部）不會出現在回應裡
export const INVOICE_TERMS = [1, 2, 3, 4, 5, 6] as const;
export type InvoiceTerm = (typeof INVOICE_TERMS)[number];

export const toInvoiceTerm = (value: number): InvoiceTerm => {
  const found = INVOICE_TERMS.find((term) => term === value);
  // 綠界回了列舉外的值就代表規格變了，靜默放行只會讓前端拿到翻不出來的鍵
  if (found === undefined)
    throw new Error(`Unexpected InvoiceTerm from ECPay: ${value}`);

  return found;
};

export const SYNC_INVOICE_WORD_SETTING_OUTCOMES = [
  'added',
  'enabled',
  'failed',
  'inUse',
  'skipped',
] as const;
export type SyncInvoiceWordSettingOutcome =
  (typeof SYNC_INVOICE_WORD_SETTING_OUTCOMES)[number];

export class SyncInvoiceWordSettingResultDto {
  @ApiProperty({
    description: '期別，1 為 1-2 月、2 為 3-4 月，依此類推',
    enum: INVOICE_TERMS,
    enumName: 'InvoiceTerm',
  })
  @IsDefined()
  @IsIn(INVOICE_TERMS)
  invoiceTerm: InvoiceTerm;

  @ApiProperty({ description: '字軌，兩碼英文' })
  @IsDefined()
  @IsString()
  invoiceHeader: string;

  @ApiProperty({ description: '起始號碼' })
  @IsDefined()
  @IsString()
  invoiceStart: string;

  @ApiProperty({ description: '結束號碼' })
  @IsDefined()
  @IsString()
  invoiceEnd: string;

  @ApiProperty({
    description: `added：新增並啟用
enabled：既有字軌已啟用
inUse：已在使用中，未變動
skipped：已被人工停用，自動同步不翻回啟用
failed：處理失敗，詳見 message`,
    enum: SYNC_INVOICE_WORD_SETTING_OUTCOMES,
    enumName: 'SyncInvoiceWordSettingOutcome',
  })
  @IsDefined()
  @IsIn(SYNC_INVOICE_WORD_SETTING_OUTCOMES)
  outcome: SyncInvoiceWordSettingOutcome;

  @ApiPropertyOptional({ description: '綠界字軌編號' })
  @IsOptional()
  @IsString()
  trackId?: string;

  @ApiPropertyOptional({ description: '失敗原因' })
  @IsOptional()
  @IsString()
  message?: string;
}
