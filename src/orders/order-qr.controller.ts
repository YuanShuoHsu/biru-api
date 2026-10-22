import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';

import {
  Audit,
  type AuditTarget,
} from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import {
  OrderQrQueryDto,
  OrderQrSecretResponseDto,
  OrderQrSessionResponseDto,
} from './dto/order-qr.dto.js';
import { ORDER_QR_SESSION_COOKIE, type QrOrderMode } from './order-qr-token.js';
import { OrderQrService } from './order-qr.service.js';

const ORDER_QR_SECRET_AUDIT: AuditTarget = {
  resource: 'organization',
  idSource: { column: 'organizationId', organization: true },
  via: { table: 'orderQrSecret', ownerColumn: 'organizationId' },
};

// 前台點餐頁 order/[mode] 的路徑段，前台改路由要一起改
const ORDER_PAGE_MODES: Record<QrOrderMode, string> = {
  counter: 'counter',
  dineIn: 'dine-in',
  driveThru: 'drive-thru',
};

@ApiTags('orders')
@Controller('organizations/:organizationSlug')
export class OrderQrController {
  constructor(private readonly orderQrService: OrderQrService) {}

  @Get('order-qr')
  @AllowAnonymous()
  @Redirect()
  @ApiOperation({
    summary:
      '前台點餐頁帶 QR code 簽章時由 rewrite 轉進來：簽章換成短效 cookie 後轉回不帶簽章的點餐頁',
  })
  async scan(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: OrderQrQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const scanned = await this.orderQrService.scan(organizationSlug, query);
    if (scanned?.issued)
      res.cookie(ORDER_QR_SESSION_COOKIE, scanned.issued.value, {
        expires: scanned.issued.session.expiresAt,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });

    const search = query.tableNumber
      ? `?${new URLSearchParams({ tableNumber: String(query.tableNumber) })}`
      : '';

    // 用相對路徑：cookie 落在使用者掃到的網域，改轉 NEXT_URL 遇到 www／preview 等不同網域就帶不到 cookie
    return {
      statusCode: 303,
      url: `/order/${ORDER_PAGE_MODES[query.mode]}/${encodeURIComponent(scanned?.slug || organizationSlug)}${search}`,
    };
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
