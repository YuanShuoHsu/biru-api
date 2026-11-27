import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { trim } from '../../common/utils/trim.js';

export class OrderReviewItemDto {
  @IsString()
  orderItemId: string;

  @ApiProperty({ description: 'true 讚，false 倒讚' })
  @IsBoolean()
  liked: boolean;
}

export class UpsertOrderReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: i18nValidationMessage('validation.isString') })
  @MaxLength(1000, { message: i18nValidationMessage('validation.maxLength') })
  comment?: string | null;

  @ApiPropertyOptional({
    description: '沒列到的品項不評價；每次送出整份取代',
    type: [OrderReviewItemDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique((item: OrderReviewItemDto) => item.orderItemId)
  @ValidateNested({ each: true })
  @Type(() => OrderReviewItemDto)
  items?: OrderReviewItemDto[];
}

export class OrderReviewResponseDto {
  rating: number;

  @ApiProperty({ nullable: true, type: String })
  comment: string | null;

  items: OrderReviewItemDto[];

  @ApiProperty({ description: '店家回覆', nullable: true, type: String })
  reply: string | null;

  @ApiProperty({ nullable: true, type: Date })
  repliedAt: Date | null;

  createdAt: Date;

  updatedAt: Date;

  @ApiProperty({ description: '首次送出後 7 天，之後不能再修改' })
  editableUntil: Date;
}
