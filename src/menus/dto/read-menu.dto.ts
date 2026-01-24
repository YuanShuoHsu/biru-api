import { ApiProperty } from '@nestjs/swagger';
import type { JsonValue } from '@prisma/client/runtime/client';

export class LocalizedFieldDto {
  @ApiProperty({ example: '繁體中文' })
  'zh-TW': string;

  @ApiProperty({ example: 'English' })
  en: string;

  @ApiProperty({ example: '日本語' })
  ja: string;

  @ApiProperty({ example: '한국어' })
  ko: string;

  @ApiProperty({ example: '简体中文' })
  'zh-CN': string;
}

export class BaseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ReadMenuItemOptionChoiceIngredientDto extends BaseDto {
  @ApiProperty({ type: LocalizedFieldDto })
  name: JsonValue;

  @ApiProperty({ type: LocalizedFieldDto })
  unit: JsonValue;

  @ApiProperty()
  usage: number;

  @ApiProperty()
  menuItemOptionChoiceId: string;
}

export class ReadMenuItemOptionChoiceDto extends BaseDto {
  @ApiProperty({ type: LocalizedFieldDto })
  name: JsonValue;

  @ApiProperty()
  extraCost: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isShared: boolean;

  @ApiProperty()
  sold: number;

  @ApiProperty()
  stock: number | null;

  @ApiProperty()
  menuItemOptionId: string;

  @ApiProperty({ type: [ReadMenuItemOptionChoiceIngredientDto] })
  ingredients: ReadMenuItemOptionChoiceIngredientDto[];
}

export class ReadMenuItemIngredientDto extends BaseDto {
  @ApiProperty({ type: LocalizedFieldDto })
  name: JsonValue;

  @ApiProperty({ type: LocalizedFieldDto })
  unit: JsonValue;

  @ApiProperty()
  usage: number;

  @ApiProperty()
  menuItemId: string;
}

export class ReadMenuItemOptionDto extends BaseDto {
  @ApiProperty({ type: LocalizedFieldDto })
  name: JsonValue;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  multiple: boolean;

  @ApiProperty()
  required: boolean;

  @ApiProperty()
  menuItemId: string;

  @ApiProperty({ type: [ReadMenuItemOptionChoiceDto] })
  choices: ReadMenuItemOptionChoiceDto[];
}

export class ReadMenuItemDto extends BaseDto {
  @ApiProperty({ type: LocalizedFieldDto })
  name: JsonValue;

  @ApiProperty({ type: LocalizedFieldDto })
  description: JsonValue;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  price: number;

  @ApiProperty()
  sold: number;

  @ApiProperty()
  stock: number | null;

  @ApiProperty()
  menuId: string;

  @ApiProperty({ type: [ReadMenuItemOptionDto] })
  options: ReadMenuItemOptionDto[];

  @ApiProperty({ type: [ReadMenuItemIngredientDto] })
  ingredients: ReadMenuItemIngredientDto[];
}

export class ReadMenuDto extends BaseDto {
  @ApiProperty({ type: LocalizedFieldDto })
  name: JsonValue;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ type: [ReadMenuItemDto] })
  items: ReadMenuItemDto[];
}
