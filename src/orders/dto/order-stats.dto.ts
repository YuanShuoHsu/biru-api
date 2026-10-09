import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  orderModeEnum,
  paymentMethodEnum,
  type OrderMode,
  type PaymentMethod,
} from 'src/db/schema/orders';
import {
  refundReasonCodeEnum,
  type RefundReasonCode,
} from 'src/db/schema/refunds';
import {
  servingTemperatureLevelEnum,
  sweetnessLevelEnum,
  type ServingTemperatureLevel,
  type SweetnessLevel,
} from 'src/db/schema/enums';

export class OrderStatsTotalsDto {
  @ApiProperty() orders: number;
  @ApiPropertyOptional({
    description:
      '淨營收：銷售減去該區間內確認的退款（退款依退款日歸期）；需 revenue:read',
  })
  revenue?: number;
  @ApiPropertyOptional({ description: '需 revenue:read' }) discount?: number;
}

export class OrderStatsBucketDto extends OrderStatsTotalsDto {
  @ApiProperty({ format: 'date-time' }) start: string;
  @ApiProperty({
    description: '區間內首次確認退款的訂單數（依首次退款日歸期）',
  })
  refundedOrders: number;
}

export class OrderStatsModeDto {
  @ApiProperty({ enum: orderModeEnum.enumValues }) mode: OrderMode;
  @ApiProperty() orders: number;
}

export class OrderStatsPaymentMethodDto {
  @ApiProperty({ enum: paymentMethodEnum.enumValues })
  paymentMethod: PaymentMethod;
  @ApiProperty() orders: number;
}

export class OrderStatsCouponDto {
  @ApiProperty() code: string;
  @ApiProperty() orders: number;
}

export class OrderStatsModifierDto {
  @ApiProperty() modifierId: string;
  @ApiProperty() modifierGroupName: string;
  @ApiProperty() modifierName: string;
  @ApiProperty({ description: '售出份數減去退款份數' }) sold: number;
}

export class OrderStatsRefundedItemDto {
  @ApiProperty() menuItemId: string;
  @ApiProperty() menuItemName: string;
  @ApiProperty({ description: '確認退款的份數' }) quantity: number;
}

export class OrderStatsRefundReasonDto {
  @ApiProperty({
    enum: refundReasonCodeEnum.enumValues,
    enumName: 'RefundReasonCode',
  })
  reasonCode: RefundReasonCode;
  @ApiProperty({ description: '確認退款的筆數' }) refunds: number;
}

export class OrderStatsSweetnessLevelDto {
  @ApiProperty({
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
  })
  level: SweetnessLevel;
  @ApiProperty({ description: '售出份數減去退款份數' }) sold: number;
}

export class OrderStatsServingTemperatureLevelDto {
  @ApiProperty({
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
  })
  level: ServingTemperatureLevel;
  @ApiProperty({ description: '售出份數減去退款份數' }) sold: number;
}

export class OrderStatsResponseDto {
  @ApiProperty({ description: '開店以來計入的訂單數（含之後退貨的訂單）' })
  lifetimeOrders: number;

  @ApiProperty({ type: [OrderStatsBucketDto] })
  buckets: OrderStatsBucketDto[];

  @ApiProperty({ type: OrderStatsTotalsDto })
  previous: OrderStatsTotalsDto;

  @ApiProperty({
    description: '依店家時區各小時（0–23）的訂單數',
    type: [Number],
  })
  hourlyOrders: number[];

  @ApiProperty({
    description:
      '期間內首次確認退款的訂單數（依首次退款日歸期，同一訂單只算一次）',
  })
  refundedOrders: number;

  @ApiProperty({
    description: '期間內確認退款份數前 10 名品項（依退款日歸期）',
    type: [OrderStatsRefundedItemDto],
  })
  refundedItems: OrderStatsRefundedItemDto[];

  @ApiProperty({
    description:
      '期間內確認退款依原因分類的筆數（依退款日歸期）；導入分類前的舊紀錄不計',
    type: [OrderStatsRefundReasonDto],
  })
  refundReasons: OrderStatsRefundReasonDto[];

  @ApiProperty({ type: [OrderStatsModeDto] })
  modes: OrderStatsModeDto[];

  @ApiProperty({ type: [OrderStatsPaymentMethodDto] })
  paymentMethods: OrderStatsPaymentMethodDto[];

  @ApiProperty({ description: '使用次數前 10 名', type: [OrderStatsCouponDto] })
  coupons: OrderStatsCouponDto[];

  @ApiProperty({
    description: '客製化選項（含加購品項上的選項）售出份數前 10 名',
    type: [OrderStatsModifierDto],
  })
  modifiers: OrderStatsModifierDto[];

  @ApiProperty({
    description: '各甜度售出份數（含加購品項）；不適用甜度的品項不計',
    type: [OrderStatsSweetnessLevelDto],
  })
  sweetnessLevels: OrderStatsSweetnessLevelDto[];

  @ApiProperty({
    description: '各冰量／溫度售出份數（含加購品項）；不分冷熱的品項不計',
    type: [OrderStatsServingTemperatureLevelDto],
  })
  servingTemperatureLevels: OrderStatsServingTemperatureLevelDto[];
}
