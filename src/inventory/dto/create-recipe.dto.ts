import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsArray,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { UNIT_FACTORS } from '../../common/constants/units.js';
import {
  IsLocalizedText,
  IsRequiredLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';
import type { UnitCode } from '../../db/schema/inventory.js';

@ValidatorConstraint({ name: 'isRecipeYieldPaired' })
class IsRecipeYieldPaired implements ValidatorConstraintInterface {
  validate(_: unknown, { object }: ValidationArguments): boolean {
    const { recipeYieldQuantity, recipeYieldUnitCode } =
      object as CreateRecipeDto;

    return (recipeYieldQuantity == null) === (recipeYieldUnitCode == null);
  }

  defaultMessage(): string {
    return 'recipeYieldQuantity 與 recipeYieldUnitCode 必須一起帶';
  }
}

export class CreateRecipeDto {
  @ApiProperty({
    type: LocalizedTextDto,
    example: { 'zh-TW': '抹茶奶酪', en: 'Matcha Panna Cotta' },
  })
  @IsLocalizedText()
  @IsRequiredLocalizedText()
  name: LocalizedText;

  @ApiPropertyOptional({
    description: '對應的菜單品項，一個品項只能有一份食譜',
  })
  @IsOptional()
  @IsString()
  menuItemId?: string | null;

  @ApiPropertyOptional({
    description:
      '對應的客製選項，一個選項只能有一份食譜；與 menuItemId 擇一，份量必須為 1',
  })
  @IsOptional()
  @IsString()
  modifierId?: string | null;

  @ApiPropertyOptional({ default: 1, description: '份量' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(9999)
  recipeYield?: number;

  @ApiPropertyOptional({
    example: '1500.000',
    description:
      '做出的總量；作為食材來源食譜時必填，與 recipeYieldUnitCode 一起帶',
  })
  @IsOptional()
  @Matches(/^(?!0+(\.0+)?$)\d{1,9}(\.\d{1,3})?$/)
  @IsNumberString()
  @Validate(IsRecipeYieldPaired)
  recipeYieldQuantity?: string | null;

  @ApiPropertyOptional({
    enum: Object.keys(UNIT_FACTORS),
    enumName: 'UnitCode',
    description: 'recipeYieldQuantity 的單位',
  })
  @IsOptional()
  @IsIn(Object.keys(UNIT_FACTORS))
  @Validate(IsRecipeYieldPaired)
  recipeYieldUnitCode?: UnitCode | null;

  @ApiPropertyOptional({
    type: [LocalizedTextDto],
    example: [{ 'zh-TW': '吉利丁片泡冷水軟化，約 5 分鐘。' }],
  })
  @IsOptional()
  @IsArray()
  @IsLocalizedText({ each: true })
  recipeInstructions?: LocalizedText[];
}

export class UpdateRecipeDto extends PartialType(CreateRecipeDto, {
  skipNullProperties: false,
}) {}

export class CreateRecipeIngredientDto {
  @ApiProperty()
  @IsString()
  ingredientId: string;

  @ApiProperty({ example: '4.000', description: '基準單位用量' })
  @Matches(/^\d{1,9}(\.\d{1,3})?$/)
  @IsNumberString()
  requiredQuantity: string;

  @ApiPropertyOptional({ description: '未帶時排在最後' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class UpdateRecipeIngredientDto extends PartialType(
  CreateRecipeIngredientDto,
  { skipNullProperties: false },
) {}
