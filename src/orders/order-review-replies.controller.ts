import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import {
  Audit,
  type AuditTarget,
} from '../common/decorators/audit.decorator.js';
import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import {
  ReplyOrderReviewDto,
  StoreOrderReviewDto,
  StoreOrderReviewListResponseDto,
  StoreOrderReviewPaginationQueryDto,
} from './dto/store-order-review.dto.js';
import { OrderReviewsService } from './order-reviews.service.js';

const REPLY_AUDIT: AuditTarget = {
  resource: 'orderReview',
  idSource: { param: 'reviewId' },
  action: 'update',
};

@ApiTags('orders')
@ApiParam({ name: 'organizationSlug', type: String })
@Controller('organizations/:organizationSlug/reviews')
export class OrderReviewRepliesController {
  constructor(private readonly orderReviewsService: OrderReviewsService) {}

  @Get()
  @Roles({ review: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: StoreOrderReviewListResponseDto })
  @ApiOperation({ summary: '查詢門市的訂單回饋列表' })
  findAll(
    @OrganizationId() organizationId: string,
    @Query() query: StoreOrderReviewPaginationQueryDto,
  ): Promise<StoreOrderReviewListResponseDto> {
    return this.orderReviewsService.listForOrganization(organizationId, query);
  }

  @Put(':reviewId/reply')
  @Roles({ review: ['reply'] }, 'organizationSlug')
  @Audit(REPLY_AUDIT)
  @ApiOkResponse({ type: StoreOrderReviewDto })
  @ApiOperation({ summary: '回覆訂單回饋；已有回覆時取代' })
  reply(
    @OrganizationId() organizationId: string,
    @Param('reviewId') reviewId: string,
    @Session() session: UserSession,
    @Body() { reply }: ReplyOrderReviewDto,
  ): Promise<StoreOrderReviewDto> {
    return this.orderReviewsService.reply(
      organizationId,
      reviewId,
      session.user.id,
      reply,
    );
  }

  @Delete(':reviewId/reply')
  @Roles({ review: ['reply'] }, 'organizationSlug')
  @Audit(REPLY_AUDIT)
  @ApiOkResponse({ type: StoreOrderReviewDto })
  @ApiOperation({ summary: '刪除訂單回饋的店家回覆' })
  removeReply(
    @OrganizationId() organizationId: string,
    @Param('reviewId') reviewId: string,
  ): Promise<StoreOrderReviewDto> {
    return this.orderReviewsService.removeReply(organizationId, reviewId);
  }
}
