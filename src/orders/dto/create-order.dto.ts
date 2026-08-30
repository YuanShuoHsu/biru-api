import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
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
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telephone?: string;
}

export class CreateOrderInvoiceDto {
  @ApiProperty({ enum: ['personal', 'company', 'donate'] })
  @IsEnum(['personal', 'company', 'donate'])
  type: 'personal' | 'company' | 'donate';

  @ApiPropertyOptional({ enum: ['mobile', 'certificate'] })
  @IsOptional()
  @IsEnum(['mobile', 'certificate'])
  carrierType?: 'mobile' | 'certificate';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrierNum?: string;

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

  @ApiProperty({
    additionalProperties: { items: { type: 'string' }, type: 'array' },
    description: 'modifierGroupId → modifierIds[]',
    type: 'object',
  })
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

  @ApiProperty({
    additionalProperties: { items: { type: 'string' }, type: 'array' },
    description: 'modifierGroupId → modifierIds[]',
    type: 'object',
  })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discountCode?: string;

  @ApiProperty({ type: CreateOrderInvoiceDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateOrderInvoiceDto)
  invoice: CreateOrderInvoiceDto;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  partySize?: number;

  @ApiPropertyOptional({ example: '2026-08-31T09:15:00+08:00' })
  @IsOptional()
  @IsISO8601()
  @Matches(/(?:Z|[+-]\d{2}:?\d{2})$/, {
    message: 'pickupTime must carry a UTC offset',
  })
  pickupTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  tableNumber?: number;
}
