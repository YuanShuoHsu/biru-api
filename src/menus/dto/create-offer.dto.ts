import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidOpeningHours } from '../../common/utils/opening-hours.js';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';

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

@ValidatorConstraint({ name: 'isOpeningHours' })
export class IsOpeningHours implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidOpeningHours(value);
  }

  defaultMessage(): string {
    return '時段格式須為 "Mo-Fr 09:00-12:00,13:00-18:00"';
  }
}

export class PriceSpecificationDto {
  @ApiProperty({ example: '150.00' })
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  @IsNumberString()
  price: string;

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
  @Min(0)
  value?: number;
}

export class CreateOfferDto {
  @ApiProperty({ example: '150.00' })
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  @IsNumberString()
  price: string;

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  @IsOptional()
  @IsEnum(itemAvailabilityEnum.enumValues)
  availability?: ItemAvailability;

  @ApiPropertyOptional({
    description:
      '可供應時段，格式同組織營業時間（如 "Mo-Fr 07:00-11:00"）；null 代表全時段供應',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @Validate(IsOpeningHours)
  availableHours?: string | null;

  @ApiPropertyOptional({
    description: '預計準備時間（分鐘）',
    example: 15,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryLeadTimeMinutes?: number | null;

  @ApiPropertyOptional({
    type: QuantitativeValueDto,
    description: '當日剩餘庫存數量',
    nullable: true,
  })
  @IsOptional()
  @Type(() => QuantitativeValueDto)
  @ValidateNested()
  inventoryLevel?: QuantitativeValueDto | null;

  @ApiPropertyOptional({ type: PriceSpecificationDto, nullable: true })
  @IsOptional()
  @Type(() => PriceSpecificationDto)
  @ValidateNested()
  priceSpecification?: PriceSpecificationDto | null;
}
