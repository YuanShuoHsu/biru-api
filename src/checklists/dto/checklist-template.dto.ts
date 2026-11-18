import { Transform, Type } from 'class-transformer';
import { ApiProperty, PartialType } from '@nestjs/swagger';

import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../common/utils/trim.js';
import {
  checklistItemTypeEnum,
  checklistTimingEnum,
  type ChecklistItemType,
  type ChecklistTiming,
} from '../../db/schema/checklists.js';

export const MEASUREMENT_LIMIT = 99999;

export class ChecklistTemplateItemInputDto {
  @ApiProperty({ description: '既有項目的 id，帶上就更新該項目；不帶就新增' })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  id?: string;

  @IsString() @IsNotEmpty() @MaxLength(100) @Transform(trim) label: string;

  @ApiProperty({
    enum: checklistItemTypeEnum.enumValues,
    enumName: 'ChecklistItemType',
  })
  @IsIn(checklistItemTypeEnum.enumValues)
  type: ChecklistItemType;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '°C',
    description: '數值類型的單位；勾選類型會存成 null',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(trim)
  unit?: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: -18,
    description: '允許範圍下限（含）；勾選類型會存成 null',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-MEASUREMENT_LIMIT)
  @Max(MEASUREMENT_LIMIT)
  minValue?: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: 7,
    description: '允許範圍上限（含）；勾選類型會存成 null',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-MEASUREMENT_LIMIT)
  @Max(MEASUREMENT_LIMIT)
  maxValue?: number | null;
}

export class CreateChecklistTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(50) @Transform(trim) name: string;

  @ApiProperty({
    enum: checklistTimingEnum.enumValues,
    enumName: 'ChecklistTiming',
  })
  @IsIn(checklistTimingEnum.enumValues)
  timing: ChecklistTiming;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({
    type: [ChecklistTemplateItemInputDto],
    description:
      '依陣列順序排列；更新時帶上就以這份為準：有 id 的更新、沒有 id 的新增、沒列出的刪除',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((item?: ChecklistTemplateItemInputDto) => item?.id ?? item)
  @ValidateNested({ each: true })
  @Type(() => ChecklistTemplateItemInputDto)
  items: ChecklistTemplateItemInputDto[];
}

export class UpdateChecklistTemplateDto extends PartialType(
  CreateChecklistTemplateDto,
  { skipNullProperties: false },
) {}

export class ChecklistTemplateItemDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty({
    enum: checklistItemTypeEnum.enumValues,
    enumName: 'ChecklistItemType',
  })
  type: ChecklistItemType;
  @ApiProperty({ nullable: true, type: String }) unit: string | null;
  @ApiProperty({ nullable: true, type: Number }) minValue: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxValue: number | null;
  @ApiProperty() sortOrder: number;
}

export class ChecklistTemplateDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() name: string;
  @ApiProperty({
    enum: checklistTimingEnum.enumValues,
    enumName: 'ChecklistTiming',
  })
  timing: ChecklistTiming;
  @ApiProperty() enabled: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ type: [ChecklistTemplateItemDto] })
  items: ChecklistTemplateItemDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
