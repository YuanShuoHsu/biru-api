import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  isObject,
  Matches,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { DINE_IN_MAX_TABLE_COUNT } from '../../common/constants/dine-in.js';
import {
  servingTemperatureLevelEnum,
  sweetnessLevelEnum,
  type ServingTemperatureLevel,
  type SweetnessLevel,
} from '../../db/schema/enums.js';
import {
  orderModeEnum,
  paymentMethodEnum,
  type OrderMode,
  type PaymentMethod,
} from '../../db/schema/orders.js';

@ValidatorConstraint({ name: 'isModifierSelections' })
class IsModifierSelections implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      isObject(value) &&
      Object.values(value).every(
        (modifierIds) =>
          Array.isArray(modifierIds) &&
          modifierIds.every((id) => typeof id === 'string'),
      )
    );
  }

  defaultMessage(): string {
    return 'modifiers 的每個值都必須是 modifierId 字串陣列';
  }
}

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
  @Validate(IsModifierSelections)
  modifiers: Record<string, string[]>;

  @ApiPropertyOptional({
    description: '選擇的溫度細項；品項有冷熱供應時必填，否則省略',
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(servingTemperatureLevelEnum.enumValues)
  servingTemperatureLevel?: ServingTemperatureLevel | null;

  @ApiPropertyOptional({
    description: '選擇的甜度；品項甜度可調時必填，其他情況忽略',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(sweetnessLevelEnum.enumValues)
  sweetnessLevel?: SweetnessLevel | null;
}

export class CreateOrderItemDto {
  @ApiProperty()
  @IsString()
  menuItemId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;

  @ApiProperty({
    additionalProperties: { items: { type: 'string' }, type: 'array' },
    description: 'modifierGroupId → modifierIds[]',
    type: 'object',
  })
  @IsObject()
  @Validate(IsModifierSelections)
  modifiers: Record<string, string[]>;

  @ApiProperty({ type: [CreateOrderItemAddOnDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((addOn: CreateOrderItemAddOnDto) => addOn.menuItemId)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemAddOnDto)
  addOns: CreateOrderItemAddOnDto[];

  @ApiPropertyOptional({
    description: '選擇的溫度細項；品項有冷熱供應時必填，否則省略',
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(servingTemperatureLevelEnum.enumValues)
  servingTemperatureLevel?: ServingTemperatureLevel | null;

  @ApiPropertyOptional({
    description: '選擇的甜度；品項甜度可調時必填，其他情況忽略',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(sweetnessLevelEnum.enumValues)
  sweetnessLevel?: SweetnessLevel | null;
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
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
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
  @Max(DINE_IN_MAX_TABLE_COUNT)
  tableNumber?: number;
}
