import { ApiProperty } from '@nestjs/swagger';
import { JsonValue } from '@prisma/client/runtime/client';

export class ReadMenuItemOptionChoiceIngredientDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  name: JsonValue;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  unit: JsonValue;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  usage: number;

  @ApiProperty()
  menuItemOptionChoiceId: string;
}

export class ReadMenuItemOptionChoiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  name: JsonValue;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  extraCost: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isShared: boolean;

  @ApiProperty()
  sold: number;

  @ApiProperty({ required: false, nullable: true })
  stock: number | null;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  menuItemOptionId: string;

  @ApiProperty({ type: [ReadMenuItemOptionChoiceIngredientDto] })
  ingredients: ReadMenuItemOptionChoiceIngredientDto[];
}

export class ReadMenuItemIngredientDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  name: JsonValue;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  unit: JsonValue;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  usage: number;

  @ApiProperty()
  menuItemId: string;
}

export class ReadMenuItemOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  name: JsonValue;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  multiple: boolean;

  @ApiProperty()
  required: boolean;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  menuItemId: string;

  @ApiProperty({ type: [ReadMenuItemOptionChoiceDto] })
  choices: ReadMenuItemOptionChoiceDto[];
}

export class ReadMenuItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  name: JsonValue;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  description: JsonValue;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  price: number;

  @ApiProperty()
  sold: number;

  @ApiProperty({ required: false, nullable: true })
  stock: number | null;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  menuId: string;

  @ApiProperty({ type: [ReadMenuItemOptionDto] })
  options: ReadMenuItemOptionDto[];

  @ApiProperty({ type: [ReadMenuItemIngredientDto] })
  ingredients: ReadMenuItemIngredientDto[];
}

export class ReadMenuDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  name: JsonValue;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  storeId: string;

  @ApiProperty({ type: [ReadMenuItemDto] })
  items: ReadMenuItemDto[];
}
