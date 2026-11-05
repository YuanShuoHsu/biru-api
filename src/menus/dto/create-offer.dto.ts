import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
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
  ValidateIf,
} from 'class-validator';
import { isValidOpeningHours } from '../../common/utils/opening-hours.js';
import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@ValidatorConstraint({ name: 'isValidFromBeforeValidThrough' })
class IsValidFromBeforeValidThrough implements ValidatorConstraintInterface {
  validate(_: unknown, { object }: ValidationArguments): boolean {
    const { validFrom, validThrough } = object as PriceSpecificationDto;
    if (!validFrom || !validThrough) return true;

    return validFrom <= validThrough;
  }

  defaultMessage(): string {
    return 'validFrom 不可晚於 validThrough';
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
    example: '2025-06-01',
    description: '促銷開始日（平台時區，含當天）',
  })
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2025-06-30',
    description: '促銷結束日（平台時區，含當天）',
  })
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
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
  @ValidateIf((_, value) => value !== undefined)
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
