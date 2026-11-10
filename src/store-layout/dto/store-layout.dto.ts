import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsPositive,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  STORE_LAYOUT_FLOORS,
  STORE_LAYOUT_ITEM_KINDS,
  type StoreLayoutFloor,
  type StoreLayoutItemKind,
} from '../../db/schema/store-layout.js';

export class StoreLayoutBoxDto {
  @ApiProperty({ enum: STORE_LAYOUT_FLOORS, enumName: 'StoreLayoutFloor' })
  @IsIn(STORE_LAYOUT_FLOORS)
  floor: StoreLayoutFloor;

  @ApiProperty({ description: '左右位置（公尺）', minimum: -100, maximum: 100 })
  @IsNumber()
  @Min(-100)
  @Max(100)
  x: number;

  @ApiProperty({ description: '前後位置（公尺）', minimum: -100, maximum: 100 })
  @IsNumber()
  @Min(-100)
  @Max(100)
  z: number;

  @ApiProperty({
    description: '寬（公尺）',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 100,
  })
  @IsPositive()
  @Max(100)
  width: number;

  @ApiProperty({
    description: '深（公尺）',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 100,
  })
  @IsPositive()
  @Max(100)
  depth: number;

  @ApiProperty({
    description: '高（公尺）',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 100,
  })
  @IsPositive()
  @Max(100)
  height: number;

  @ApiProperty({
    description: '離該樓層地面的高度（公尺）',
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  elevation: number;

  @ApiProperty({
    description: '前台翻譯用的鍵',
    pattern: '^[a-zA-Z][a-zA-Z0-9]{0,39}$',
    example: 'prepTable',
  })
  @Matches(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/)
  label: string;
}

export class StoreLayoutItemDto extends StoreLayoutBoxDto {
  @ApiProperty({
    enum: STORE_LAYOUT_ITEM_KINDS,
    enumName: 'StoreLayoutItemKind',
  })
  @IsIn(STORE_LAYOUT_ITEM_KINDS)
  kind: StoreLayoutItemKind;

  @ApiPropertyOptional({
    description: '內用桌號；有值的項目就是內用桌，同一門市不可重複',
    minimum: 1,
    maximum: 999,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(999)
  tableNumber?: number;
}

export class StoreLayoutSeatDto extends StoreLayoutBoxDto {}

export class StoreLayoutDataDto {
  @ApiProperty({ type: [StoreLayoutItemDto], maxItems: 2000 })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => StoreLayoutItemDto)
  items: StoreLayoutItemDto[];

  @ApiProperty({ type: [StoreLayoutSeatDto], maxItems: 5000 })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => StoreLayoutSeatDto)
  seats: StoreLayoutSeatDto[];
}

export class UpdateStoreLayoutDto {
  @ApiProperty({ type: StoreLayoutDataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => StoreLayoutDataDto)
  data: StoreLayoutDataDto;
}

export class StoreLayoutResponseDto {
  @ApiProperty() organizationId: string;
  @ApiProperty() schemaVersion: number;
  @ApiProperty({ type: StoreLayoutDataDto }) data: StoreLayoutDataDto;
  @ApiProperty() updatedAt: Date;
}
