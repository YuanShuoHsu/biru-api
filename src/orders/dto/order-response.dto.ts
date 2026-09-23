import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  invoiceCarrierTypeEnum,
  invoiceStatusEnum,
  invoiceTypeEnum,
  paymentStatusEnum,
  type InvoiceCarrierType,
  type InvoiceStatus,
  type InvoiceType,
  type PaymentStatus,
} from 'src/db/schema/invoices';
import {
  servingTemperatureLevelEnum,
  sweetnessLevelEnum,
  type ServingTemperatureLevel,
  type SweetnessLevel,
} from 'src/db/schema/enums';
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
  @ApiPropertyOptional({
    description: '選擇的溫度細項；品項不分冷熱時為 null',
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
  })
  servingTemperatureLevel?: ServingTemperatureLevel | null;
  @ApiPropertyOptional({
    description: '甜度；可調為客人所選、固定為品項設定，不適用時為 null',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
  })
  sweetnessLevel?: SweetnessLevel | null;
}

export class OrderItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty() menuItemId: string;
  @ApiProperty() menuItemName: string;
  @ApiProperty() unitPrice: string;
  @ApiPropertyOptional() priceCurrency?: string | null;
  @ApiProperty() orderQuantity: number;
  @ApiPropertyOptional({
    description: '選擇的溫度細項；品項不分冷熱時為 null',
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
  })
  servingTemperatureLevel?: ServingTemperatureLevel | null;
  @ApiPropertyOptional({
    description: '甜度；可調為客人所選、固定為品項設定，不適用時為 null',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
  })
  sweetnessLevel?: SweetnessLevel | null;
  @ApiPropertyOptional({ type: [OrderItemModifierSnapshotDto] })
  modifiers?: OrderItemModifierSnapshotDto[] | null;
  @ApiPropertyOptional({ type: [OrderItemAddOnSnapshotDto] })
  addOns?: OrderItemAddOnSnapshotDto[] | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

// https://schema.org/customer
export class OrderCustomerDto {
  @ApiPropertyOptional() email?: string | null;
  @ApiProperty() name: string;
  @ApiPropertyOptional() remark?: string | null;
  @ApiPropertyOptional() telephone?: string | null;
}

// https://schema.org/Invoice
export class OrderInvoiceDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty({ enum: invoiceTypeEnum.enumValues, enumName: 'InvoiceType' })
  type: InvoiceType;
  @ApiPropertyOptional({
    enum: invoiceCarrierTypeEnum.enumValues,
    enumName: 'InvoiceCarrierType',
  })
  carrierType?: InvoiceCarrierType | null;
  @ApiPropertyOptional() carrierNum?: string | null;
  @ApiPropertyOptional() email?: string | null;
  @ApiPropertyOptional() customerIdentifier?: string | null;
  @ApiPropertyOptional() customerName?: string | null;
  @ApiPropertyOptional() customerAddr?: string | null;
  @ApiPropertyOptional() donateCode?: string | null;
  @ApiProperty({
    enum: paymentStatusEnum.enumValues,
    enumName: 'InvoicePaymentStatus',
  })
  paymentStatus: PaymentStatus;
  @ApiProperty({
    enum: invoiceStatusEnum.enumValues,
    enumName: 'InvoiceStatus',
  })
  status: InvoiceStatus;
  @ApiPropertyOptional() invoiceNumber?: string | null;
  @ApiPropertyOptional() invoiceDate?: Date | null;
  @ApiPropertyOptional() randomNumber?: string | null;
  @ApiPropertyOptional() printedAt?: Date | null;
  @ApiProperty({ description: '已重設列印的次數' })
  printResetCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OrderResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() sellerId: string;
  @ApiPropertyOptional() userId?: string | null;
  @ApiProperty({ enum: orderModeEnum.enumValues }) mode: OrderMode;
  @ApiProperty() orderNumber: string;
  @ApiProperty({ type: OrderCustomerDto }) customer: OrderCustomerDto;
  @ApiProperty({ enum: paymentMethodEnum.enumValues })
  paymentMethod: PaymentMethod;
  @ApiPropertyOptional() paymentMethodId?: string | null;
  @ApiProperty({ enum: orderStatusEnum.enumValues }) orderStatus: OrderStatus;
  @ApiPropertyOptional() confirmationNumber?: string | null;
  @ApiProperty() orderDate: Date;
  @ApiPropertyOptional() paymentDate?: Date | null;
  @ApiPropertyOptional() paymentDueDate?: Date | null;
  @ApiPropertyOptional() tradeNo?: string | null;
  @ApiPropertyOptional() partySize?: number | null;
  @ApiPropertyOptional() pickupTime?: Date | null;
  @ApiPropertyOptional() tableNumber?: number | null;
  @ApiPropertyOptional() discount?: string | null;
  @ApiPropertyOptional() discountCode?: string | null;
  @ApiPropertyOptional() discountCurrency?: string | null;
  @ApiProperty() subtotal: string;
  @ApiProperty() total: string;
  @ApiPropertyOptional({ type: OrderInvoiceDto })
  invoice?: OrderInvoiceDto | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items: OrderItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

// https://schema.org/seller
export class OrderSellerDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() logo?: string | null;
  @ApiPropertyOptional() addressCountry?: string | null;
}

export class UserOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ type: OrderSellerDto }) seller: OrderSellerDto;
}

export class UserOrderListResponseDto {
  @ApiProperty({ type: [UserOrderResponseDto] }) data: UserOrderResponseDto[];
  @ApiProperty() total: number;
}
