import { ApiProperty } from '@nestjs/swagger';

export const ECPAY_ATTENTION_TYPES = [
  'invoiceSettlementFailed',
  'refundUnconfirmed',
  'invoiceStuck',
  'invoiceOverdue',
  'paymentProblem',
  'callbackFailed',
] as const;
export type EcpayAttentionType = (typeof ECPAY_ATTENTION_TYPES)[number];

export class EcpayAttentionItemDto {
  @ApiProperty({
    description: `需要人工處理的類型
- invoiceSettlementFailed：退款完成但發票沒作廢也沒折讓
- refundUnconfirmed：退刷送出後沒收到綠界結果，可退數量被佔住
- invoiceStuck：發票卡在開立中，查證失敗需人工到綠界後台確認
- invoiceOverdue：訂單已付款但發票遲遲沒開出來
- paymentProblem：綠界回報付款異常
- callbackFailed：綠界通知驗簽失敗或處理失敗`,
    enum: ECPAY_ATTENTION_TYPES,
    enumName: 'EcpayAttentionType',
  })
  type: EcpayAttentionType;

  @ApiProperty({ nullable: true })
  orderId: string | null;

  @ApiProperty({ nullable: true })
  orderNumber: string | null;

  @ApiProperty({ nullable: true })
  confirmationNumber: string | null;

  @ApiProperty({ description: '錯誤訊息或補充說明', nullable: true })
  detail: string | null;

  @ApiProperty()
  occurredAt: Date;
}
