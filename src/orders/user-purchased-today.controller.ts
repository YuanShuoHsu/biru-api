import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import {
  PurchasedTodayDto,
  PurchasedTodayQueryDto,
} from './dto/purchased-today.dto.js';
import { PurchasedTodayService } from './purchased-today.service.js';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('users/me/purchased-today')
export class UserPurchasedTodayController {
  constructor(private readonly purchasedTodayService: PurchasedTodayService) {}

  @Get()
  @ApiOkResponse({ type: [PurchasedTodayDto] })
  @ApiOperation({
    summary:
      '查詢我今天在此門市已買的限購品項份數（同營業日，不含取消、付款失敗與全額退款；沒買過的品項不列出）',
  })
  findAll(
    @Query() { organizationSlug }: PurchasedTodayQueryDto,
    @Session() session: UserSession,
  ): Promise<PurchasedTodayDto[]> {
    return this.purchasedTodayService.findForUser(
      session.user.id,
      organizationSlug,
    );
  }
}
