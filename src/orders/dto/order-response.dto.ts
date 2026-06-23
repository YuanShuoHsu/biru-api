import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Invoice } from 'src/db/schema/invoices';
import type {
  OrderItemAddOnSnapshot,
  OrderItemModifierSnapshot,
  OrderMode,
  OrderStatus,
  PaymentMethod,
} from 'src/db/schema/orders';

export class OrderItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() menuItemId: string;
  @ApiProperty() menuItemName: string;
  @ApiProperty() unitPrice: string;
  @ApiProperty() orderQuantity: number;
  @ApiPropertyOptional() modifiers?: OrderItemModifierSnapshot[] | null;
  @ApiPropertyOptional() addOns?: OrderItemAddOnSnapshot[] | null;
}

export class OrderResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() sellerId: string;
  @ApiProperty() mode: OrderMode;
  @ApiProperty() orderNumber: string;
  @ApiProperty() customerName: string;
  @ApiPropertyOptional() customerPhone?: string | null;
  @ApiPropertyOptional() customerEmail?: string | null;
  @ApiPropertyOptional() customerNotes?: string | null;
  @ApiProperty() paymentMethod: PaymentMethod;
  @ApiProperty() orderStatus: OrderStatus;
  @ApiPropertyOptional() confirmationNumber?: string | null;
  @ApiPropertyOptional() discount?: string | null;
  @ApiPropertyOptional() discountCode?: string | null;
  @ApiPropertyOptional() invoice?: Invoice | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items: OrderItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
