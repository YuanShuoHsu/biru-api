import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  orderModeEnum,
  paymentMethodEnum,
  type OrderMode,
  type PaymentMethod,
} from 'src/db/schema/orders';

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
}
