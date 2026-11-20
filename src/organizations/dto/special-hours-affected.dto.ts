import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

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

const PROCESS_LIMIT = 100;

export class ProcessSpecialHoursAffectedDto {
  @ApiPropertyOptional({
    type: [String],
    description: '預覽時列出的自取訂單 id；需要訂單更新與退款權限',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROCESS_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  orderIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: '預覽時列出的候位號碼 id；需要候位更新權限',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROCESS_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  ticketIds?: string[];
}

export const SPECIAL_HOURS_PROCESS_STATUSES = [
  'cancelled',
  'failed',
  'manualRefundRequired',
  'refunded',
  'skipped',
] as const;

export type SpecialHoursProcessStatus =
  (typeof SPECIAL_HOURS_PROCESS_STATUSES)[number];

export class SpecialHoursProcessResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    enum: SPECIAL_HOURS_PROCESS_STATUSES,
    enumName: 'SpecialHoursProcessStatus',
    description:
      'refunded：已經綠界全額退款並寄信；cancelled：已取消（未付款訂單不寄信，候位號碼有 email 時寄信）；manualRefundRequired：非綠界付款，未處理，須由店員另外退款；skipped：已不受影響或已不在進行中，未處理；failed：處理失敗，維持原狀，可再送一次',
  })
  status: SpecialHoursProcessStatus;

  @ApiPropertyOptional({ description: '失敗時的錯誤代碼' })
  code?: string;

  @ApiPropertyOptional({ description: '失敗時的錯誤訊息' })
  message?: string;
}

export class SpecialHoursProcessResponseDto {
  @ApiProperty({ type: [SpecialHoursProcessResultDto] })
  orders: SpecialHoursProcessResultDto[];

  @ApiProperty({ type: [SpecialHoursProcessResultDto] })
  waitlistTickets: SpecialHoursProcessResultDto[];
}
