import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';

import {
  ANONYMOUS_THROTTLER,
  HOURLY_THROTTLER,
} from '../common/constants/throttle.js';
import { ORDER_QR_SESSION_COOKIE } from '../orders/order-qr-token.js';

import {
  CreateSharedCartDto,
  JoinSharedCartDto,
  SharedCartProfileDto,
} from './dto/shared-cart.dto.js';
import { SharedCartResponseDto } from './dto/shared-cart-response.dto.js';
import { isSharedCartNotFound } from './shared-cart-errors.js';
import {
  clearSharedCartParticipantCookie,
  setSharedCartParticipantCookie,
} from './shared-cart-participant-token.js';
import {
  SharedCartsService,
  type SharedCartResult,
} from './shared-carts.service.js';

const memberOf = (session: UserSession | null) =>
  session
    ? {
        id: session.user.id,
        name: session.user.name,
        sessionId: session.session.id,
      }
    : null;

const qrSessionOf = (req: Request) =>
  req.cookies?.[ORDER_QR_SESSION_COOKIE] as string | undefined;

const cookiesOf = (req: Request) =>
  req.cookies as Record<string, unknown> | undefined;

const respond = (res: Response, { cart, issued }: SharedCartResult) => {
  setSharedCartParticipantCookie(res, issued);
  return cart;
};

@AllowAnonymous()
@ApiTags('shared-carts')
@Controller('organizations/:organizationSlug/shared-carts')
export class SharedCartsController {
  constructor(private readonly sharedCartsService: SharedCartsService) {}

  @Post()
  @Throttle({
    [ANONYMOUS_THROTTLER]: { limit: 30, ttl: minutes(1) },
    [HOURLY_THROTTLER]: { limit: 150, ttl: hours(1) },
  })
  @ApiOperation({
    summary: '發起共享點餐單（內用、櫃檯、得來速須先掃店內 QR code）',
  })
  async create(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateSharedCartDto,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedCartResponseDto> {
    return respond(
      res,
      await this.sharedCartsService.create(
        organizationSlug,
        dto,
        memberOf(session),
        qrSessionOf(req),
        cookiesOf(req),
      ),
    );
  }

  @Post('join')
  @HttpCode(200)
  @Throttle({
    [ANONYMOUS_THROTTLER]: { limit: 30, ttl: minutes(1) },
    [HOURLY_THROTTLER]: { limit: 150, ttl: hours(1) },
  })
  @ApiOperation({
    summary: '以 4 碼單號送出加入請求，由單內已加入的人允許後才看得到內容',
  })
  async join(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: JoinSharedCartDto,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedCartResponseDto> {
    return respond(
      res,
      await this.sharedCartsService.join(
        organizationSlug,
        dto,
        memberOf(session),
        qrSessionOf(req),
        cookiesOf(req),
      ),
    );
  }

  @Get('current')
  @ApiOperation({ summary: '目前瀏覽器所在的共享點餐單' })
  async findCurrent(
    @Param('organizationSlug') organizationSlug: string,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedCartResponseDto> {
    return respond(
      res,
      await this.sharedCartsService
        .findCurrent(organizationSlug, memberOf(session), cookiesOf(req))
        .catch(async (error: unknown) => {
          if (isSharedCartNotFound(error))
            clearSharedCartParticipantCookie(
              res,
              await this.sharedCartsService.participantCookieName(
                organizationSlug,
              ),
            );
          throw error;
        }),
    );
  }

  @Patch('current/me')
  @ApiOperation({ summary: '修改自己在共享點餐單的頭像或暱稱' })
  async updateMe(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: SharedCartProfileDto,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedCartResponseDto> {
    return respond(
      res,
      await this.sharedCartsService.updateMe(
        organizationSlug,
        dto,
        memberOf(session),
        cookiesOf(req),
      ),
    );
  }

  @Post('current/requests/:participantId/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: '允許一筆加入請求（已加入的參與者皆可，先處理者為準）',
  })
  async approveRequest(
    @Param('organizationSlug') organizationSlug: string,
    @Param('participantId') participantId: string,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedCartResponseDto> {
    return respond(
      res,
      await this.sharedCartsService.approveRequest(
        organizationSlug,
        participantId,
        memberOf(session),
        cookiesOf(req),
      ),
    );
  }

  @Delete('current/requests/:participantId')
  @ApiOperation({ summary: '拒絕一筆加入請求；對方可重新送出' })
  async rejectRequest(
    @Param('organizationSlug') organizationSlug: string,
    @Param('participantId') participantId: string,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedCartResponseDto> {
    return respond(
      res,
      await this.sharedCartsService.rejectRequest(
        organizationSlug,
        participantId,
        memberOf(session),
        cookiesOf(req),
      ),
    );
  }

  @Delete('current/me')
  @HttpCode(204)
  @ApiOperation({
    summary:
      '離開已加入的共享點餐單（沒有已加入的單時取消加入請求）；最後一位已加入的人離開時刪除整張單',
  })
  leaveMe(
    @Param('organizationSlug') organizationSlug: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.sharedCartsService.leaveMe(organizationSlug, cookiesOf(req));
  }

  @Delete('current/request')
  @HttpCode(204)
  @ApiOperation({ summary: '取消送往另一張共享點餐單的加入請求' })
  cancelRequest(
    @Param('organizationSlug') organizationSlug: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.sharedCartsService.cancelRequest(
      organizationSlug,
      cookiesOf(req),
    );
  }
}
