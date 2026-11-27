import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { trim } from '../../common/utils/trim.js';
import {
  checklistItemTypeEnum,
  checklistTimingEnum,
  type ChecklistItemType,
  type ChecklistTiming,
} from '../../db/schema/checklists.js';

import { DATE_PATTERN } from '../../organizations/dto/special-hours.dto.js';

import { MEASUREMENT_LIMIT } from './checklist-template.dto.js';

export class FillChecklistItemDto {
  @ApiPropertyOptional({ description: '勾選項目必填，數值項目不能帶' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  checked?: boolean;

  @ApiPropertyOptional({ description: '數值項目必填，勾選項目不能帶' })
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-MEASUREMENT_LIMIT)
  @Max(MEASUREMENT_LIMIT)
  value?: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: '處置說明；數值超出允許範圍時必填',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  actionNote?: string | null;

  @ApiPropertyOptional({
    example: '2026-11-27',
    description:
      '畫面上這份紀錄的營業日；與伺服器的營業日不同時回 409 checklistBusinessDateChanged',
  })
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  businessDate?: string;
}

export class ChecklistRunQueryDto extends PickType(PaginationQueryDto, [
  'limit',
  'offset',
] as const) {
  @ApiPropertyOptional({ example: '2026-11-01', description: '營業日起（含）' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: '營業日迄（含）' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional() @IsUUID() templateId?: string;
}

class ChecklistRunItemDto {
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
  @ApiProperty({ nullable: true, type: Boolean }) checked: boolean | null;
  @ApiProperty({ nullable: true, type: Number }) value: number | null;
  @ApiProperty() outOfRange: boolean;
  @ApiProperty({ nullable: true, type: String }) actionNote: string | null;
  @ApiProperty({ nullable: true, type: String }) filledByName: string | null;
  @ApiProperty({ nullable: true, type: Date }) filledAt: Date | null;
}

export class ChecklistRunDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: '今天尚未開始填寫時為 null，項目取自範本現況',
  })
  id: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: '範本已刪除時為 null',
  })
  templateId: string | null;
  @ApiProperty({ example: '2026-11-16', description: '營業日（平台時區）' })
  businessDate: string;
  @ApiProperty() name: string;
  @ApiProperty({
    enum: checklistTimingEnum.enumValues,
    enumName: 'ChecklistTiming',
  })
  timing: ChecklistTiming;
  @ApiProperty({ nullable: true, type: Date }) startedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) completedAt: Date | null;
  @ApiProperty({
    description: '已填項目數：勾選為是或已填數值，與完成判斷同一規則',
  })
  filledCount: number;
  @ApiProperty({ type: [ChecklistRunItemDto] }) items: ChecklistRunItemDto[];
}

export class ChecklistRunListResponseDto {
  @ApiProperty({ type: [ChecklistRunDto] }) data: ChecklistRunDto[];
  @ApiProperty() total: number;
}
