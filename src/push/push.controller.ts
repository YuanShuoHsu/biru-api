import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';

import {
  ANONYMOUS_THROTTLER,
  HOURLY_THROTTLER,
} from '../common/constants/throttle.js';

import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto.js';
import { PushService } from './push.service.js';

@AllowAnonymous()
@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscriptions')
  @HttpCode(204)
  @Throttle({
    [ANONYMOUS_THROTTLER]: { limit: 30, ttl: minutes(1) },
    [HOURLY_THROTTLER]: { limit: 150, ttl: hours(1) },
  })
  @ApiOperation({
    summary:
      '儲存瀏覽器的推播訂閱（同一 endpoint 覆蓋舊的）；登入會員綁定本人，訪客須綁定可讀的訂單或候位號碼牌',
  })
  subscribe(
    @Body() dto: CreatePushSubscriptionDto,
    @Session() session: UserSession | null,
  ): Promise<void> {
    return this.pushService.subscribe(dto, session?.user ?? null);
  }

  @Delete('subscriptions')
  @HttpCode(204)
  @Throttle({
    [ANONYMOUS_THROTTLER]: { limit: 30, ttl: minutes(1) },
    [HOURLY_THROTTLER]: { limit: 150, ttl: hours(1) },
  })
  @ApiOperation({ summary: '刪除瀏覽器的推播訂閱（不存在也回 204）' })
  unsubscribe(@Body() dto: DeletePushSubscriptionDto): Promise<void> {
    return this.pushService.unsubscribe(dto);
  }
}
