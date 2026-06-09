import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from 'src/db/schema/menus';

@ValidatorConstraint({ name: 'isValidFromBeforeValidThrough' })
class IsValidFromBeforeValidThrough implements ValidatorConstraintInterface {
  validate(_: unknown, { object }: ValidationArguments): boolean {
    const { validFrom, validThrough } = object as PriceSpecificationDto;
    if (!validFrom || !validThrough) return true;

    return new Date(validFrom) < new Date(validThrough);
  }

  defaultMessage(): string {
    return 'validFrom 必須早於 validThrough';
  }
}

export class PriceSpecificationDto {
  @ApiProperty({ example: '150.00' })
  @IsNumberString()
  price: string;

  @ApiProperty({ example: 'TWD' })
  @IsString()
  priceCurrency: string;

  @ApiPropertyOptional({
    example: '2025-06-01T00:00:00+08:00',
    description: '促銷開始時間（ISO 8601）',
  })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2025-06-30T23:59:59+08:00',
    description: '促銷結束時間（ISO 8601）',
  })
  @IsOptional()
  @IsDateString()
  @Validate(IsValidFromBeforeValidThrough)
  validThrough?: string;
}

export class QuantitativeValueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;
}

export class CreateOfferDto {
  @ApiProperty({ example: '150.00' })
  @IsNumberString()
  price: string;

  @ApiProperty({ default: 'TWD' })
  @IsString()
  priceCurrency: string;

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  @IsOptional()
  @IsEnum(itemAvailabilityEnum.enumValues)
  availability?: ItemAvailability;

  @ApiPropertyOptional({
    type: QuantitativeValueDto,
    description: '預計準備時間，unitText 建議用 "minute"',
  })
  @IsOptional()
  @Type(() => QuantitativeValueDto)
  @ValidateNested()
  deliveryLeadTime?: QuantitativeValueDto;

  @ApiPropertyOptional({
    type: QuantitativeValueDto,
    description: '當日剩餘庫存數量',
  })
  @IsOptional()
  @Type(() => QuantitativeValueDto)
  @ValidateNested()
  inventoryLevel?: QuantitativeValueDto;

  @ApiPropertyOptional({ type: PriceSpecificationDto })
  @IsOptional()
  @Type(() => PriceSpecificationDto)
  @ValidateNested()
  priceSpecification?: PriceSpecificationDto;
}
