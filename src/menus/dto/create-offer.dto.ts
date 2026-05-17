import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import type {
  AcceptedPaymentMethod,
  AvailableDeliveryMethod,
  BusinessEntityType,
  ItemAvailability,
} from 'src/db/schema/menus';

export class EligibleQuantityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minValue?: number;

  @ApiPropertyOptional({
    description: 'UN/CEFACT Common Code, e.g. "C62" for piece',
  })
  @IsOptional()
  @IsString()
  unitCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;
}

export class PriceSpecificationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  valueAddedTaxIncluded?: boolean;
}

export class ShippingRateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

export class OfferShippingDetailsDto {
  @ApiPropertyOptional({ type: ShippingRateDto })
  @IsOptional()
  @Type(() => ShippingRateDto)
  @ValidateNested()
  shippingRate?: ShippingRateDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  doesNotShip?: boolean;

  @ApiPropertyOptional({
    type: EligibleQuantityDto,
    description: '配送時間，unitText 建議用 "minute"',
  })
  @IsOptional()
  @Type(() => EligibleQuantityDto)
  @ValidateNested()
  transitTime?: EligibleQuantityDto;

  @ApiPropertyOptional({ description: '配送目的地，例如 "Taipei City"' })
  @IsOptional()
  @IsString()
  shippingDestination?: string;

  @ApiPropertyOptional({ description: '免運費門檻金額' })
  @IsOptional()
  @IsNumber()
  freeShippingThreshold?: number;
}

const ACCEPTED_PAYMENT_METHOD_VALUES: AcceptedPaymentMethod[] = [
  'Cash',
  'DirectDebit',
  'ByInvoice',
  'ByBankTransferInAdvance',
  'CheckInAdvance',
  'COD',
  'PayPal',
];

const BUSINESS_ENTITY_TYPE_VALUES: BusinessEntityType[] = [
  'Business',
  'Enduser',
  'PublicInstitution',
  'Reseller',
];

const AVAILABLE_DELIVERY_METHOD_VALUES: AvailableDeliveryMethod[] = [
  'DeliveryModePickUp',
  'DeliveryModeOwnFleet',
  'ParcelService',
];

const ITEM_AVAILABILITY_VALUES: ItemAvailability[] = [
  'BackOrder',
  'Discontinued',
  'InStock',
  'InStoreOnly',
  'LimitedAvailability',
  'MadeToOrder',
  'OnlineOnly',
  'OutOfStock',
  'PreOrder',
  'PreSale',
  'Reserved',
  'SoldOut',
];

export class CreateOfferDto {
  @ApiPropertyOptional({ example: '150.00' })
  @IsOptional()
  @IsString()
  price?: string;

  @ApiPropertyOptional({ default: 'TWD' })
  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @ApiPropertyOptional({ enum: ITEM_AVAILABILITY_VALUES })
  @IsOptional()
  @IsEnum(ITEM_AVAILABILITY_VALUES)
  availability?: ItemAvailability;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availabilityStarts?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availabilityEnds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priceValidUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validThrough?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ type: EligibleQuantityDto })
  @IsOptional()
  @Type(() => EligibleQuantityDto)
  @ValidateNested()
  eligibleQuantity?: EligibleQuantityDto;

  @ApiPropertyOptional({
    enum: BUSINESS_ENTITY_TYPE_VALUES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(BUSINESS_ENTITY_TYPE_VALUES, { each: true })
  eligibleCustomerType?: BusinessEntityType[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  validForMemberTier?: string[];

  @ApiPropertyOptional({
    enum: AVAILABLE_DELIVERY_METHOD_VALUES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AVAILABLE_DELIVERY_METHOD_VALUES, { each: true })
  availableDeliveryMethod?: AvailableDeliveryMethod[];

  @ApiPropertyOptional({
    type: EligibleQuantityDto,
    description: '預計準備時間，unitText 建議用 "minute"',
  })
  @IsOptional()
  @Type(() => EligibleQuantityDto)
  @ValidateNested()
  deliveryLeadTime?: EligibleQuantityDto;

  @ApiPropertyOptional({
    type: EligibleQuantityDto,
    description: '當日剩餘庫存數量',
  })
  @IsOptional()
  @Type(() => EligibleQuantityDto)
  @ValidateNested()
  inventoryLevel?: EligibleQuantityDto;

  @ApiPropertyOptional({
    enum: ACCEPTED_PAYMENT_METHOD_VALUES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ACCEPTED_PAYMENT_METHOD_VALUES, { each: true })
  acceptedPaymentMethod?: AcceptedPaymentMethod[];

  @ApiPropertyOptional({
    type: PriceSpecificationDto,
    description: '最低消費金額門檻，例如滿額優惠',
  })
  @IsOptional()
  @Type(() => PriceSpecificationDto)
  @ValidateNested()
  eligibleTransactionVolume?: PriceSpecificationDto;

  @ApiPropertyOptional({ type: OfferShippingDetailsDto })
  @IsOptional()
  @Type(() => OfferShippingDetailsDto)
  @ValidateNested()
  shippingDetails?: OfferShippingDetailsDto;
}
