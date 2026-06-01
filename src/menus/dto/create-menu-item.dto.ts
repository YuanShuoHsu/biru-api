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
import { restrictedDietEnum } from 'src/db/schema/menus';

import { CreateOfferDto } from './create-offer.dto';
import { NutritionInformationDto } from './nutrition-information.dto';

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

  @ApiPropertyOptional({ enum: restrictedDietEnum.enumValues, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(restrictedDietEnum.enumValues, { each: true })
  suitableForDiet?: RestrictedDiet[];

  @ApiPropertyOptional({ type: NutritionInformationDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NutritionInformationDto)
  nutrition?: NutritionInformation;

  @ApiPropertyOptional({ type: CreateOfferDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOfferDto)
  offer?: CreateOfferDto;
}
