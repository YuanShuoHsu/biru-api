import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
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
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  isObject,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
  type ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
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

const CARRIER_NUM_PATTERNS = {
  certificate: /^[A-Z]{2}\d{14}$/,
  mobile: /^\/[A-Z0-9+\-.]{7}$/,
} as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const isInvoiceType =
  (type: CreateOrderInvoiceDto['type']) =>
  (invoice: CreateOrderInvoiceDto): boolean =>
    invoice.type === type;

@ValidatorConstraint({ name: 'isCarrierNum' })
class IsCarrierNum implements ValidatorConstraintInterface {
  validate(value: unknown, { object }: ValidationArguments): boolean {
    const { carrierType } = object as CreateOrderInvoiceDto;
    return (
      !!carrierType &&
      typeof value === 'string' &&
      CARRIER_NUM_PATTERNS[carrierType].test(value)
    );
  }

  defaultMessage(args: ValidationArguments): string {
    const { carrierType } = args.object as CreateOrderInvoiceDto;
    return i18nValidationMessage(
      carrierType === 'certificate'
        ? 'validation.invoiceCertificate'
        : 'validation.invoiceMobileBarcode',
    )(args);
  }
}

export class CreateOrderInvoiceDto {
  @ApiProperty({ enum: ['personal', 'company', 'donate'] })
  @IsEnum(['personal', 'company', 'donate'])
  type: 'personal' | 'company' | 'donate';

  @ApiPropertyOptional({
    description: '僅個人發票使用；未帶則開紙本',
    enum: ['mobile', 'certificate'],
  })
  @ValidateIf(isInvoiceType('personal'))
  @IsOptional()
  @IsEnum(['mobile', 'certificate'])
  carrierType?: 'mobile' | 'certificate';

  @ApiPropertyOptional({
    description:
      '個人發票帶載具時必填：手機條碼為 / 加 7 碼，自然人憑證為 2 碼大寫英文加 14 碼數字',
  })
  @ValidateIf(
    (invoice: CreateOrderInvoiceDto) =>
      invoice.type === 'personal' &&
      typeof invoice.carrierType === 'string' &&
      Object.hasOwn(CARRIER_NUM_PATTERNS, invoice.carrierType),
  )
  @Validate(IsCarrierNum)
  carrierNum?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '公司發票必填，8 碼數字' })
  @ValidateIf(isInvoiceType('company'))
  @Matches(/^\d{8}$/, {
    message: i18nValidationMessage('validation.invoiceCustomerIdentifier'),
  })
  customerIdentifier?: string;

  @ApiPropertyOptional({ description: '公司發票必填', maxLength: 60 })
  @ValidateIf(isInvoiceType('company'))
  @Transform(trim)
  @IsString({ message: i18nValidationMessage('validation.isString') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.isNotEmpty') })
  @MaxLength(60, { message: i18nValidationMessage('validation.maxLength') })
  customerName?: string;

  @ApiPropertyOptional({ description: '公司發票必填', maxLength: 100 })
  @ValidateIf(isInvoiceType('company'))
  @Transform(trim)
  @IsString({ message: i18nValidationMessage('validation.isString') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.isNotEmpty') })
  @MaxLength(100, { message: i18nValidationMessage('validation.maxLength') })
  customerAddr?: string;

  @ApiPropertyOptional({ description: '捐贈發票必填，3 至 7 碼數字' })
  @ValidateIf(isInvoiceType('donate'))
  @Matches(/^\d{3,7}$/, {
    message: i18nValidationMessage('validation.invoiceDonateCode'),
  })
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
  @IsDefined()
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
