import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  orderModeEnum,
  paymentMethodEnum,
  type OrderMode,
  type PaymentMethod,
} from 'src/db/schema/orders';

export class CreateOrderCustomerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderInvoiceDto {
  @ApiProperty({ enum: ['personal', 'company', 'donate'] })
  @IsEnum(['personal', 'company', 'donate'])
  type: 'personal' | 'company' | 'donate';

  @ApiPropertyOptional({ enum: ['individual', 'mobile', 'certificate'] })
  @IsOptional()
  @IsEnum(['individual', 'mobile', 'certificate'])
  carrierType?: 'individual' | 'mobile' | 'certificate';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carruerNum?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerIdentifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerAddr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  donateCode?: string;
}

export class CreateOrderItemAddOnDto {
  @ApiProperty()
  @IsString()
  menuItemId: string;

  @ApiProperty({ description: 'modifierGroupId → modifierIds[]' })
  @IsObject()
  modifiers: Record<string, string[]>;
}

export class CreateOrderItemDto {
  @ApiProperty()
  @IsString()
  menuItemId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'modifierGroupId → modifierIds[]' })
  @IsObject()
  modifiers: Record<string, string[]>;

  @ApiProperty({ type: [CreateOrderItemAddOnDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemAddOnDto)
  addOns: CreateOrderItemAddOnDto[];
}

export class CreateOrderDto {
  @ApiProperty({ enum: orderModeEnum.enumValues })
  @IsEnum(orderModeEnum.enumValues)
  mode: OrderMode;

  @ApiProperty({ type: CreateOrderCustomerDto })
  @ValidateNested()
  @Type(() => CreateOrderCustomerDto)
  customer: CreateOrderCustomerDto;

  @ApiProperty({ enum: paymentMethodEnum.enumValues })
  @IsEnum(paymentMethodEnum.enumValues)
  payment: PaymentMethod;

  @ApiPropertyOptional({ type: CreateOrderInvoiceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderInvoiceDto)
  invoice?: CreateOrderInvoiceDto;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
