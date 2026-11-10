import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { trim } from '../../common/utils/trim.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';
import {
  sharedCartAvatarEnum,
  type SharedCartAvatar,
} from '../../db/schema/shared-carts.js';
import { CreateOrderItemDto } from '../../orders/dto/create-order.dto.js';

export const SHARED_CART_NICKNAME_MAX_LENGTH = 20;
export const SHARED_CART_MAX_ITEMS = 50;

const UNPRINTABLE =
  '\\p{Cc}\\p{Co}\\p{Cn}\\p{Cs}\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069';

export const UNPRINTABLE_CHARACTERS = new RegExp(`[${UNPRINTABLE}]`, 'gu');

export class SharedCartProfileDto {
  @ApiPropertyOptional({
    description:
      '未帶時：登入會員為 member，其他人隨機動物；member 只限登入會員',
    enum: sharedCartAvatarEnum.enumValues,
    enumName: 'SharedCartAvatar',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(sharedCartAvatarEnum.enumValues)
  avatar?: SharedCartAvatar;

  @ApiPropertyOptional({
    description: '未帶時：登入會員為會員名字，其他人為「匿名＋動物」',
    maxLength: SHARED_CART_NICKNAME_MAX_LENGTH,
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString({ message: i18nValidationMessage('validation.isString') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.isNotEmpty') })
  @MaxLength(SHARED_CART_NICKNAME_MAX_LENGTH, {
    message: i18nValidationMessage('validation.maxLength'),
  })
  @Matches(new RegExp(`^[^${UNPRINTABLE}]*$`, 'u'), {
    message: i18nValidationMessage('validation.printableText'),
  })
  nickname?: string;
}

export class CreateSharedCartDto extends SharedCartProfileDto {
  @ApiProperty({ enum: orderModeEnum.enumValues })
  @IsEnum(orderModeEnum.enumValues)
  mode: OrderMode;
}

export class JoinSharedCartDto extends CreateSharedCartDto {
  @ApiProperty({ example: '0123' })
  @Matches(/^\d{4}$/)
  code: string;
}

export class AddSharedCartItemsDto {
  @ApiProperty({
    description: `可一次加入多筆（例如帶入自己的購物車）；整張單最多 ${SHARED_CART_MAX_ITEMS} 筆`,
    type: [CreateOrderItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SHARED_CART_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
