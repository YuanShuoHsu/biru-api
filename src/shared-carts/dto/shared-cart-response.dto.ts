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
  requestedAt: Date;
  expiresAt: Date;
}

export class SharedCartCheckoutDto {
  participantId: string;
  lockedUntil: Date;
}

export class SharedCartResponseDto {
  @ApiProperty({
    description: '待允許時為 null：單號會因拒絕而換發，允許後才看得到新的單號',
    nullable: true,
    type: String,
  })
  code: string | null;

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
      '正在結帳的人與鎖定的失效時間：最後一次延長後 2 分鐘，且不超過開始結帳後 10 分鐘。鎖定期間只有他能修改品項、移除參與者或允許加入，單內任何人都不能離開。沒有人在結帳或待允許時為 null',
    nullable: true,
    type: SharedCartCheckoutDto,
  })
  checkout: SharedCartCheckoutDto | null;

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

  @ApiProperty({
    description:
      '以 joinSharedCart 的 accessToken 送出，訂閱這個裝置已加入與待允許的單的 sharedCartUpdated；2 小時後失效，之後的回應會換發新的',
  })
  socketToken: string;
}
