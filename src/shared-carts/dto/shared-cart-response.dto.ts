import { ApiProperty } from '@nestjs/swagger';

import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';
import {
  sharedCartAvatarEnum,
  sharedCartParticipantStatusEnum,
  type SharedCartAvatar,
  type SharedCartParticipantStatus,
} from '../../db/schema/shared-carts.js';
import { CreateOrderItemDto } from '../../orders/dto/create-order.dto.js';

export class SharedCartProfileResponseDto {
  id: string;

  @ApiProperty({
    enum: sharedCartAvatarEnum.enumValues,
    enumName: 'SharedCartAvatar',
  })
  avatar: SharedCartAvatar;

  nickname: string;

  @ApiProperty({
    description: '頭像為 member 時的會員頭像',
    nullable: true,
    type: String,
  })
  image: string | null;
}

export class SharedCartMeResponseDto extends SharedCartProfileResponseDto {
  @ApiProperty({
    description:
      'pending 時看不到單內的參與者、品項與加入請求，也不能修改或送單',
    enum: sharedCartParticipantStatusEnum.enumValues,
    enumName: 'SharedCartParticipantStatus',
  })
  status: SharedCartParticipantStatus;
}

export class SharedCartParticipantResponseDto extends SharedCartProfileResponseDto {
  isMe: boolean;
}

export class SharedCartRequestResponseDto extends SharedCartProfileResponseDto {
  requestedAt: Date;
}

export class SharedCartItemResponseDto extends CreateOrderItemDto {
  id: string;
  participantId: string;
}

export class SharedCartOutgoingRequestDto {
  code: string;
  requestedAt: Date;
  expiresAt: Date;
}

export class SharedCartResponseDto {
  code: string;

  @ApiProperty({ enum: orderModeEnum.enumValues })
  mode: OrderMode;

  @ApiProperty({ nullable: true, type: Number })
  tableNumber: number | null;

  @ApiProperty({
    description: '已加入時為整張單的失效時間；待允許時為這筆加入請求的失效時間',
  })
  expiresAt: Date;

  me: SharedCartMeResponseDto;

  @ApiProperty({
    description:
      '已加入這張單、同時在等另一張單允許時的那筆請求；允許的那一刻才離開這張單',
    nullable: true,
    type: SharedCartOutgoingRequestDto,
  })
  outgoingRequest: SharedCartOutgoingRequestDto | null;

  @ApiProperty({
    description: '已加入的參與者；待允許時為空',
    type: [SharedCartParticipantResponseDto],
  })
  participants: SharedCartParticipantResponseDto[];

  @ApiProperty({
    description: '等待允許加入的請求；待允許時為空',
    type: [SharedCartRequestResponseDto],
  })
  requests: SharedCartRequestResponseDto[];

  @ApiProperty({
    description: '待允許時為空',
    type: [SharedCartItemResponseDto],
  })
  items: SharedCartItemResponseDto[];
}
