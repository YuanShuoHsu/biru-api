import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { trim } from '../../common/utils/trim.js';

export const STORE_ORDER_REVIEW_NUMBER_FILTER_FIELDS = ['rating'] as const;
export const STORE_ORDER_REVIEW_BOOLEAN_FILTER_FIELDS = ['hasReply'] as const;
export const STORE_ORDER_REVIEW_DATE_FILTER_FIELDS = ['createdAt'] as const;
const STORE_ORDER_REVIEW_FILTER_FIELDS = [
  ...STORE_ORDER_REVIEW_NUMBER_FILTER_FIELDS,
  ...STORE_ORDER_REVIEW_BOOLEAN_FILTER_FIELDS,
  ...STORE_ORDER_REVIEW_DATE_FILTER_FIELDS,
] as const;

type StoreOrderReviewFilterField =
  (typeof STORE_ORDER_REVIEW_FILTER_FIELDS)[number];

const STORE_ORDER_REVIEW_SORT_FIELDS = ['createdAt', 'rating'] as const;

type StoreOrderReviewSortField =
  (typeof STORE_ORDER_REVIEW_SORT_FIELDS)[number];

export class StoreOrderReviewPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: STORE_ORDER_REVIEW_FILTER_FIELDS,
    enumName: 'StoreOrderReviewFilterField',
  })
  @IsOptional()
  @IsIn(STORE_ORDER_REVIEW_FILTER_FIELDS)
  filterField?: StoreOrderReviewFilterField;

  @ApiPropertyOptional({
    enum: STORE_ORDER_REVIEW_SORT_FIELDS,
    enumName: 'StoreOrderReviewSortField',
    description: '省略時依建立時間新到舊排序',
  })
  @IsOptional()
  @IsIn(STORE_ORDER_REVIEW_SORT_FIELDS)
  sortBy?: StoreOrderReviewSortField;
}

export class ReplyOrderReviewDto {
  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString({ message: i18nValidationMessage('validation.isString') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.isNotEmpty') })
  @MaxLength(1000, { message: i18nValidationMessage('validation.maxLength') })
  reply: string;
}

export class StoreOrderReviewItemDto {
  orderItemId: string;

  @ApiProperty({ description: '下單當時的品項名稱' })
  menuItemName: string;

  @ApiProperty({ description: 'true 讚，false 倒讚' })
  liked: boolean;
}

export class StoreOrderReviewDto {
  id: string;

  orderId: string;

  orderNumber: string;

  @ApiProperty({ nullable: true, type: String })
  confirmationNumber: string | null;

  rating: number;

  @ApiProperty({
    description: '訂單個資去識別化後為 null',
    nullable: true,
    type: String,
  })
  comment: string | null;

  items: StoreOrderReviewItemDto[];

  @ApiProperty({ nullable: true, type: String })
  reply: string | null;

  @ApiProperty({ nullable: true, type: Date })
  repliedAt: Date | null;

  createdAt: Date;

  updatedAt: Date;

  @ApiProperty({
    description: 'false 時新增或修改回覆會以 orderReviewReplyExpired 拒絕',
  })
  canReply: boolean;
}

export class StoreOrderReviewListResponseDto {
  @ApiProperty({ type: [StoreOrderReviewDto] })
  data: StoreOrderReviewDto[];

  total: number;
}
