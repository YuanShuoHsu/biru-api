import { ApiProperty } from '@nestjs/swagger';

import type { RefundChannel } from '../../db/schema/refunds.js';

import { OrderTicketJobDto } from './order-ticket.dto.js';
import { OrderResponseDto } from './order-response.dto.js';
import { OrderTransitionDto } from './order-transition.dto.js';

export class AdminOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ isArray: true, type: OrderTransitionDto })
  availableTransitions: OrderTransitionDto[];

  @ApiProperty({
    description:
      '是否可退款；退款不走 transitions，須呼叫 orders/{orderId}/refunds',
  })
  refundable: boolean;

  @ApiProperty({
    description:
      'ecpay：可直接透過綠界退刷；manual：綠界不支援此付款方式的退款 API，系統僅登錄，需店家自行退款',
    enum: ['ecpay', 'manual'],
    enumName: 'RefundChannel',
  })
  refundChannel: RefundChannel;

  @ApiProperty({
    description: '在途（排隊、列印中、結果不明）的工作單與退品單',
    isArray: true,
    type: OrderTicketJobDto,
  })
  orderTicketJobs: OrderTicketJobDto[];

  @ApiProperty({
    description: '這張訂單有分到品項的工作單印表機，重印只能選這些',
    isArray: true,
    type: String,
  })
  orderTicketPrinterIds: string[];

  @ApiProperty({
    description:
      '訂單狀態是否允許重印工作單；店家有沒有工作單印表機要另外看印表機清單',
  })
  orderTicketReprintable: boolean;
}
