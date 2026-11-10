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
import {
  clearSharedCartParticipantCookie,
  setSharedCartParticipantCookie,
  SHARED_CART_PARTICIPANT_COOKIE,
} from './shared-cart-participant-token.js';
import {
  SharedCartsService,
  type SharedCartResult,
} from './shared-carts.service.js';

const memberOf = (session: UserSession | null) =>
  session ? { id: session.user.id, name: session.user.name } : null;

const qrSessionOf = (req: Request) =>
  req.cookies?.[ORDER_QR_SESSION_COOKIE] as string | undefined;

const participantOf = (req: Request): unknown =>
  req.cookies?.[SHARED_CART_PARTICIPANT_COOKIE];

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
        participantOf(req),
      ),
    );
  }

  @Post('join')
  @HttpCode(200)
  @Throttle({
    [ANONYMOUS_THROTTLER]: { limit: 30, ttl: minutes(1) },
    [HOURLY_THROTTLER]: { limit: 150, ttl: hours(1) },
  })
  @ApiOperation({ summary: '以 6 碼單號加入共享點餐單' })
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
        participantOf(req),
      ),
    );
  }

  @Get('current')
  @ApiOperation({ summary: '目前瀏覽器所在的共享點餐單' })
  async findCurrent(
    @Param('organizationSlug') organizationSlug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedCartResponseDto> {
    return respond(
      res,
      await this.sharedCartsService.findCurrent(
        organizationSlug,
        participantOf(req),
      ),
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
        participantOf(req),
      ),
    );
  }

  @Delete('current/me')
  @HttpCode(204)
  @ApiOperation({ summary: '離開共享點餐單；最後一人離開時刪除整張單' })
  async leaveMe(
    @Param('organizationSlug') organizationSlug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sharedCartsService.leaveMe(organizationSlug, participantOf(req));
    clearSharedCartParticipantCookie(res);
  }
}
