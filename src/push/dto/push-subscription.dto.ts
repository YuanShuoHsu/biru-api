import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { isIP } from 'node:net';

import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { languagesEnum, type Language } from '../../db/schema/enums.js';
import {
  pushSubscriptionAppEnum,
  type PushSubscriptionApp,
} from '../../db/schema/push.js';

const hasWaitlistTarget = ({
  organizationSlug,
  waitlistTicketId,
}: CreatePushSubscriptionDto) =>
  organizationSlug !== undefined || waitlistTicketId !== undefined;

@ValidatorConstraint({ name: 'hasNoOrderTarget' })
class HasNoOrderTarget implements ValidatorConstraintInterface {
  validate(_: unknown, { object }: ValidationArguments): boolean {
    return (object as CreatePushSubscriptionDto).orderId === undefined;
  }

  defaultMessage(): string {
    return 'orderId 與 waitlistTicketId 不可同時帶';
  }
}

// https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html#case-2-application-can-send-requests-to-any-external-ip-address-or-domain-name
@ValidatorConstraint({ name: 'hasDomainHost' })
class HasDomainHost implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !URL.canParse(value)) return false;

    const { hostname, port } = new URL(value);

    return !port && !isIP(hostname.replace(/^\[|\]$/g, ''));
  }

  defaultMessage(): string {
    return 'endpoint 必須是網域名稱，不可為 IP 或指定連接埠';
  }
}

export class DeletePushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true })
  @Validate(HasDomainHost)
  @MaxLength(2048)
  endpoint: string;
}

class PushSubscriptionKeysDto {
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

  @ValidateIf(hasWaitlistTarget)
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  organizationSlug?: string;

  @ApiPropertyOptional({
    description: '須與 organizationSlug 一起帶，且不可與 orderId 同時帶',
  })
  @ValidateIf(hasWaitlistTarget)
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Validate(HasNoOrderTarget)
  waitlistTicketId?: string;
}
