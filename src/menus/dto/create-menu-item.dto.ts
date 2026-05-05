import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import type { NutritionInformation, RestrictedDiet } from 'src/db/schema/menus';

class NutritionInformationDto implements NutritionInformation {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calories?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carbohydrateContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cholesterolContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fatContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fiberContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proteinContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  saturatedFatContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  servingSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sodiumContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sugarContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transFatContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unsaturatedFatContent?: string;
}

const RESTRICTED_DIET_VALUES: RestrictedDiet[] = [
  'DiabeticDiet',
  'GlutenFreeDiet',
  'HalalDiet',
  'HinduDiet',
  'KosherDiet',
  'LowCalorieDiet',
  'LowFatDiet',
  'LowLactoseDiet',
  'LowSaltDiet',
  'VeganDiet',
  'VegetarianDiet',
];

export class CreateMenuItemDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ enum: RESTRICTED_DIET_VALUES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(RESTRICTED_DIET_VALUES, { each: true })
  suitableForDiet?: RestrictedDiet[];

  @ApiPropertyOptional({ type: NutritionInformationDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NutritionInformationDto)
  nutrition?: NutritionInformation;
}
