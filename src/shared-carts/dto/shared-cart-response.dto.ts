import { ApiProperty } from '@nestjs/swagger';

import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';
import {
  sharedCartAvatarEnum,
  type SharedCartAvatar,
} from '../../db/schema/shared-carts.js';
import { CreateOrderItemDto } from '../../orders/dto/create-order.dto.js';

export class SharedCartParticipantResponseDto {
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

  isMe: boolean;
}

export class SharedCartItemResponseDto extends CreateOrderItemDto {
  id: string;
  participantId: string;
}

export class SharedCartResponseDto {
  code: string;

  @ApiProperty({ enum: orderModeEnum.enumValues })
  mode: OrderMode;

  @ApiProperty({ nullable: true, type: Number })
  tableNumber: number | null;

  expiresAt: Date;

  participants: SharedCartParticipantResponseDto[];
  items: SharedCartItemResponseDto[];
}
