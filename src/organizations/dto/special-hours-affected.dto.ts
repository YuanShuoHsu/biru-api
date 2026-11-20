import { ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { OrderResponseDto } from '../../orders/dto/order-response.dto.js';
import { WaitlistTicketListItemDto } from '../../waitlist/dto/waitlist-response.dto.js';

export class SpecialHoursAffectedOrderDto extends PickType(OrderResponseDto, [
  'customer',
  'id',
  'orderNumber',
  'orderStatus',
  'paymentDate',
  'paymentMethod',
  'pickupTime',
  'total',
] as const) {}

export class SpecialHoursAffectedTicketDto extends PickType(
  WaitlistTicketListItemDto,
  [
    'calledAt',
    'createdAt',
    'email',
    'id',
    'name',
    'partySize',
    'phoneNumber',
    'status',
    'ticketNumber',
  ] as const,
) {}

const WITHOUT_ORDER_PERMISSION = '沒有訂單更新權限時省略';

export class SpecialHoursAffectedDto {
  @ApiPropertyOptional({
    type: [SpecialHoursAffectedOrderDto],
    description: `已付款、可經綠界全額退款（信用卡、Apple Pay）的自取訂單；${WITHOUT_ORDER_PERMISSION}`,
  })
  refundOrders?: SpecialHoursAffectedOrderDto[];

  @ApiPropertyOptional({
    type: [SpecialHoursAffectedOrderDto],
    description: `已付款、須由店員另外退款的自取訂單（信用卡、Apple Pay 以外的付款方式）；${WITHOUT_ORDER_PERMISSION}`,
  })
  manualRefundOrders?: SpecialHoursAffectedOrderDto[];

  @ApiPropertyOptional({
    type: [SpecialHoursAffectedOrderDto],
    description: `尚未付款的自取訂單；${WITHOUT_ORDER_PERMISSION}`,
  })
  unpaidOrders?: SpecialHoursAffectedOrderDto[];

  @ApiPropertyOptional({
    type: [SpecialHoursAffectedTicketDto],
    description:
      '今天特殊公休或已過特殊時段打烊時間時，今天仍在候位或叫號中的號碼；沒有候位更新權限時省略',
  })
  waitlistTickets?: SpecialHoursAffectedTicketDto[];
}
