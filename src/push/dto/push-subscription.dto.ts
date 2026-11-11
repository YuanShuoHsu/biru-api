import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { languagesEnum, type Language } from '../../db/schema/enums.js';
import {
  pushSubscriptionAppEnum,
  type PushSubscriptionApp,
} from '../../db/schema/push.js';

export class DeletePushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;
}

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  auth: string;
}

// https://developer.mozilla.org/en-US/docs/Web/API/PushSubscription/toJSON
export class CreatePushSubscriptionDto extends DeletePushSubscriptionDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;

  @ApiProperty({
    enum: pushSubscriptionAppEnum.enumValues,
    enumName: 'PushSubscriptionApp',
  })
  @IsEnum(pushSubscriptionAppEnum.enumValues)
  app: PushSubscriptionApp;

  @ApiPropertyOptional({
    description: '未帶時取請求語系',
    enum: languagesEnum.enumValues,
  })
  @IsOptional()
  @IsEnum(languagesEnum.enumValues)
  lang?: Language;

  @ApiPropertyOptional({ description: '訪客須綁定訂單或候位號碼牌其中之一' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  orderId?: string;

  @ApiPropertyOptional({ description: '建立訂單時取得；訪客訂單必帶' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  accessToken?: string;

  @ValidateIf((dto: CreatePushSubscriptionDto) => !!dto.waitlistTicketId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  organizationSlug?: string;

  @ValidateIf((dto: CreatePushSubscriptionDto) => !!dto.organizationSlug)
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  waitlistTicketId?: string;
}
