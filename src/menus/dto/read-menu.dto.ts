import { ApiProperty } from '@nestjs/swagger';

import { LocalizedFieldDto } from 'src/common/dto/localized-field.dto';

export class ReadMenuItemOptionChoiceIngredientDto {
  @ApiProperty({
    description: 'ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: '識別碼', example: 'sugar_cane' })
  key: string;

  @ApiProperty({ description: '名稱', type: LocalizedFieldDto })
  name: LocalizedFieldDto;

  @ApiProperty({ description: '單位', type: LocalizedFieldDto })
  unit: LocalizedFieldDto;

  @ApiProperty({ description: '使用量', example: 1.5 })
  usage: number;

  @ApiProperty({
    description: '選項內容 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  menuItemOptionChoiceId: string;

  @ApiProperty({ description: '建立時間', example: '2025-10-14T12:34:56.000Z' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}

export class ReadMenuItemOptionChoiceDto {
  @ApiProperty({
    description: 'ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: '識別碼', example: 'less_sugar' })
  key: string;

  @ApiProperty({ description: '名稱', type: LocalizedFieldDto })
  name: LocalizedFieldDto;

  @ApiProperty({ description: '額外費用', example: 0 })
  extraCost: number;

  @ApiProperty({ description: '是否啟用', example: true })
  isActive: boolean;

  @ApiProperty({ description: '是否共用', example: false })
  isShared: boolean;

  @ApiProperty({ description: '已售出數量', example: 100 })
  sold: number;

  @ApiProperty({ description: '庫存', example: 50, nullable: true })
  stock: number | null;

  @ApiProperty({
    description: '菜單選項 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  menuItemOptionId: string;

  @ApiProperty({
    description: '包含成分',
    type: [ReadMenuItemOptionChoiceIngredientDto],
  })
  ingredients: ReadMenuItemOptionChoiceIngredientDto[];

  @ApiProperty({ description: '建立時間', example: '2025-10-14T12:34:56.000Z' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}

export class ReadMenuItemIngredientDto {
  @ApiProperty({
    description: 'ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: '識別碼', example: 'tea_leaf' })
  key: string;

  @ApiProperty({ description: '名稱', type: LocalizedFieldDto })
  name: LocalizedFieldDto;

  @ApiProperty({ description: '單位', type: LocalizedFieldDto })
  unit: LocalizedFieldDto;

  @ApiProperty({ description: '使用量', example: 10 })
  usage: number;

  @ApiProperty({
    description: '菜單項目 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  menuItemId: string;

  @ApiProperty({ description: '建立時間', example: '2025-10-14T12:34:56.000Z' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}

export class ReadMenuItemOptionDto {
  @ApiProperty({
    description: 'ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: '識別碼', example: 'sugar_level' })
  key: string;

  @ApiProperty({ description: '名稱', type: LocalizedFieldDto })
  name: LocalizedFieldDto;

  @ApiProperty({ description: '是否啟用', example: true })
  isActive: boolean;

  @ApiProperty({ description: '是否複選', example: false })
  multiple: boolean;

  @ApiProperty({ description: '是否必填', example: true })
  required: boolean;

  @ApiProperty({
    description: '菜單項目 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  menuItemId: string;

  @ApiProperty({
    description: '選項內容清單',
    type: [ReadMenuItemOptionChoiceDto],
  })
  choices: ReadMenuItemOptionChoiceDto[];

  @ApiProperty({ description: '建立時間', example: '2025-10-14T12:34:56.000Z' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}

export class ReadMenuItemDto {
  @ApiProperty({
    description: 'ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: '識別碼', example: 'black_tea' })
  key: string;

  @ApiProperty({ description: '名稱', type: LocalizedFieldDto })
  name: LocalizedFieldDto;

  @ApiProperty({ description: '描述', type: LocalizedFieldDto })
  description: LocalizedFieldDto;

  @ApiProperty({
    description: '圖片路徑',
    example: 'https://example.com/image.jpg',
  })
  image: string;

  @ApiProperty({ description: '是否啟用', example: true })
  isActive: boolean;

  @ApiProperty({ description: '價格', example: 50 })
  price: number;

  @ApiProperty({ description: '已售出數量', example: 1000 })
  sold: number;

  @ApiProperty({ description: '庫存', example: 200, nullable: true })
  stock: number | null;

  @ApiProperty({
    description: '菜單 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  menuId: string;

  @ApiProperty({ description: '項目選項', type: [ReadMenuItemOptionDto] })
  options: ReadMenuItemOptionDto[];

  @ApiProperty({ description: '項目成分', type: [ReadMenuItemIngredientDto] })
  ingredients: ReadMenuItemIngredientDto[];

  @ApiProperty({ description: '建立時間', example: '2025-10-14T12:34:56.000Z' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}

export class ReadMenuDto {
  @ApiProperty({
    description: 'ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: '識別碼', example: 'winter_menu' })
  key: string;

  @ApiProperty({ description: '名稱', type: LocalizedFieldDto })
  name: LocalizedFieldDto;

  @ApiProperty({ description: '是否啟用', example: true })
  isActive: boolean;

  @ApiProperty({
    description: '門市 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  storeId: string;

  @ApiProperty({ description: '菜單項目清單', type: [ReadMenuItemDto] })
  items: ReadMenuItemDto[];

  @ApiProperty({ description: '建立時間', example: '2025-10-14T12:34:56.000Z' })
  createdAt: Date;

  @ApiProperty({
    description: '最後更新時間',
    example: '2025-10-14T12:34:56.000Z',
  })
  updatedAt: Date;
}
