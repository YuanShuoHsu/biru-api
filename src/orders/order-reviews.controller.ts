import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
  OrderReviewResponseDto,
  UpsertOrderReviewDto,
} from './dto/order-review.dto.js';
import { OrderReviewsService } from './order-reviews.service.js';

@AllowAnonymous()
@ApiTags('orders')
@Controller('organizations/:organizationSlug/orders/:orderId/review')
export class OrderReviewsController {
  constructor(private readonly orderReviewsService: OrderReviewsService) {}

  @Get()
  @ApiOperation({ summary: '查詢訂單回饋與店家回覆' })
  @ApiQuery({ name: 'accessToken', required: false, type: String })
  @ApiOkResponse({
    type: OrderReviewResponseDto,
    description: '尚未填寫時為 null',
  })
  findOne(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Query('accessToken') accessToken: string | undefined,
    @Session() session: UserSession | null,
  ): Promise<OrderReviewResponseDto | null> {
    return this.orderReviewsService.getReview(
      organizationSlug,
      orderId,
      session?.user ?? null,
      accessToken || null,
    );
  }

  @Put()
  @Throttle({
    [ANONYMOUS_THROTTLER]: { limit: 30, ttl: minutes(1) },
    [HOURLY_THROTTLER]: { limit: 150, ttl: hours(1) },
  })
  @ApiOperation({
    summary: '填寫或修改訂單回饋（限下單者，訂單完成後；首次送出 7 天內可改）',
  })
  @ApiQuery({ name: 'accessToken', required: false, type: String })
  @ApiOkResponse({ type: OrderReviewResponseDto })
  upsert(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Query('accessToken') accessToken: string | undefined,
    @Session() session: UserSession | null,
    @Body() dto: UpsertOrderReviewDto,
  ): Promise<OrderReviewResponseDto> {
    return this.orderReviewsService.upsertReview(
      organizationSlug,
      orderId,
      session?.user ?? null,
      accessToken || null,
      dto,
    );
  }
}
