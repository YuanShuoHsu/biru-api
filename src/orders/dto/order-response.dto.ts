import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Invoice } from 'src/db/schema/invoices';
import {
  orderModeEnum,
  orderStatusEnum,
  paymentMethodEnum,
  type OrderMode,
  type OrderStatus,
  type PaymentMethod,
} from 'src/db/schema/orders';

export class OrderItemModifierSnapshotDto {
  @ApiProperty() modifierGroupId: string;
  @ApiProperty() modifierGroupName: string;
  @ApiProperty() modifierId: string;
  @ApiProperty() modifierName: string;
  @ApiPropertyOptional() priceAdjustment?: string | null;
}

export class OrderItemAddOnSnapshotDto {
  @ApiProperty() menuItemId: string;
  @ApiProperty() menuItemName: string;
  @ApiProperty() unitPrice: string;
  @ApiProperty({ type: [OrderItemModifierSnapshotDto] })
  modifiers: OrderItemModifierSnapshotDto[];
}

export class OrderItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() menuItemId: string;
  @ApiProperty() menuItemName: string;
  @ApiProperty() unitPrice: string;
  @ApiPropertyOptional() priceCurrency?: string | null;
  @ApiProperty() orderQuantity: number;
  @ApiPropertyOptional({ type: [OrderItemModifierSnapshotDto] })
  modifiers?: OrderItemModifierSnapshotDto[] | null;
  @ApiPropertyOptional({ type: [OrderItemAddOnSnapshotDto] })
  addOns?: OrderItemAddOnSnapshotDto[] | null;
}

export class OrderResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() sellerId: string;
  @ApiProperty({ enum: orderModeEnum.enumValues }) mode: OrderMode;
  @ApiProperty() orderNumber: string;
  @ApiProperty() customerName: string;
  @ApiPropertyOptional() customerPhone?: string | null;
  @ApiPropertyOptional() customerEmail?: string | null;
  @ApiPropertyOptional() customerNotes?: string | null;
  @ApiProperty({ enum: paymentMethodEnum.enumValues })
  paymentMethod: PaymentMethod;
  @ApiPropertyOptional() paymentMethodId?: string | null;
  @ApiProperty({ enum: orderStatusEnum.enumValues }) orderStatus: OrderStatus;
  @ApiPropertyOptional() confirmationNumber?: string | null;
  @ApiPropertyOptional() paymentDate?: Date | null;
  @ApiPropertyOptional() tradeNo?: string | null;
  @ApiPropertyOptional() discount?: string | null;
  @ApiPropertyOptional() discountCode?: string | null;
  @ApiPropertyOptional() invoice?: Invoice | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items: OrderItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
