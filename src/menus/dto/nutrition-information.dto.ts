// https://schema.org/NutritionInformation

import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

import { trim } from '../../common/utils/trim.js';
import type { NutritionInformation } from '../../db/schema/menus.js';

const NutritionValue = (example: string) =>
  applyDecorators(
    ApiPropertyOptional({ example }),
    ValidateIf((_, value) => value !== undefined),
    Transform(trim),
    IsString(),
    IsNotEmpty(),
    MaxLength(50),
  );

export class NutritionInformationDto implements NutritionInformation {
  @NutritionValue('180 calories') calories?: string;
  @NutritionValue('20 g') carbohydrateContent?: string;
  @NutritionValue('15 mg') cholesterolContent?: string;
  @NutritionValue('7 g') fatContent?: string;
  @NutritionValue('0 g') fiberContent?: string;
  @NutritionValue('9 g') proteinContent?: string;
  @NutritionValue('4.5 g') saturatedFatContent?: string;
  @NutritionValue('360 ml') servingSize?: string;
  @NutritionValue('120 mg') sodiumContent?: string;
  @NutritionValue('17 g') sugarContent?: string;
  @NutritionValue('0 g') transFatContent?: string;
  @NutritionValue('2 g') unsaturatedFatContent?: string;
}
