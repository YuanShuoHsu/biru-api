import { ApiProperty } from '@nestjs/swagger';

import type { EcpayCallbackEndpoint } from 'src/db/schema/ecpay-callback-logs';
import { ecpayCallbackEndpointEnum } from 'src/db/schema/ecpay-callback-logs';

export class OrderPaymentNotificationDto {
  @ApiProperty({ description: '紀錄 ID' })
  id: string;

  @ApiProperty({
    description:
      'return：綠界背景付款通知；result：顧客導回時的通知；query：本站主動向綠界查證',
    enum: ecpayCallbackEndpointEnum.enumValues,
    enumName: 'EcpayCallbackEndpoint',
  })
  endpoint: EcpayCallbackEndpoint;

  @ApiProperty({ description: '綠界簽章是否驗證通過' })
  macValid: boolean;

  @ApiProperty({ description: '是否已據此更新訂單' })
  handled: boolean;

  @ApiProperty({ description: '失敗原因', nullable: true })
  error: string | null;

  @ApiProperty({ description: '發生時間' })
  createdAt: Date;
}
