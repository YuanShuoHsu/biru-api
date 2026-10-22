import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';

import {
  Audit,
  type AuditTarget,
} from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import {
  CreateOrderQrSessionDto,
  OrderQrSecretResponseDto,
  OrderQrSessionResponseDto,
} from './dto/order-qr.dto.js';
import { ORDER_QR_SESSION_COOKIE } from './order-qr-token.js';
import { OrderQrService } from './order-qr.service.js';

const ORDER_QR_SECRET_AUDIT: AuditTarget = {
  resource: 'organization',
  idSource: { column: 'organizationId', organization: true },
  via: { table: 'orderQrSecret', ownerColumn: 'organizationId' },
};

@ApiTags('orders')
@Controller('organizations/:organizationSlug')
export class OrderQrController {
  constructor(private readonly orderQrService: OrderQrService) {}

  @Post('order-qr-sessions')
  @AllowAnonymous()
  @ApiOperation({
    summary: '掃描店內 QR code 後換成短效 cookie，之後網址不再帶簽章',
  })
  async createSession(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateOrderQrSessionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderQrSessionResponseDto> {
    const { session, value } = await this.orderQrService.createSession(
      organizationSlug,
      dto,
    );
    res.cookie(ORDER_QR_SESSION_COOKIE, value, {
      expires: session.expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return session;
  }

  @Get('order-qr-sessions/current')
  @AllowAnonymous()
  @ApiOperation({ summary: '目前瀏覽器持有的店內 QR code 點餐資格' })
  findSession(
    @Param('organizationSlug') organizationSlug: string,
    @Req() req: Request,
  ): Promise<OrderQrSessionResponseDto> {
    return this.orderQrService.findSession(
      organizationSlug,
      req.cookies?.[ORDER_QR_SESSION_COOKIE] as string | undefined,
    );
  }

  @Get('order-qr-secret')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '店內 QR code 金鑰的更換狀態' })
  findSecretStatus(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<OrderQrSecretResponseDto> {
    return this.orderQrService.getSecretStatus(organizationSlug);
  }

  @Post('order-qr-secret/rotate')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(ORDER_QR_SECRET_AUDIT)
  @ApiOperation({
    summary:
      '更換店內 QR code 金鑰：已印出的桌號／櫃台／得來速 QR code 立即失效',
  })
  rotateSecret(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<OrderQrSecretResponseDto> {
    return this.orderQrService.rotateSecret(organizationSlug);
  }

  @Post('order-qr-secret/restore')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(ORDER_QR_SECRET_AUDIT)
  @ApiOperation({
    summary: '換回上一把金鑰：更換前印出的 QR code 恢復有效',
  })
  restoreSecret(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<OrderQrSecretResponseDto> {
    return this.orderQrService.restoreSecret(organizationSlug);
  }
}
