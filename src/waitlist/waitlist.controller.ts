import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';

import { I18nLang } from 'nestjs-i18n';
import { Audit } from '../common/decorators/audit.decorator.js';
import { toLanguage } from '../common/utils/language.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { CreateWaitlistTicketDto } from './dto/create-waitlist-ticket.dto.js';
import {
  AdminWaitlistResponseDto,
  WaitlistErrorResponseDto,
  WaitlistStatusResponseDto,
  WaitlistTicketDetailResponseDto,
  WaitlistTicketListItemDto,
  WaitlistTicketResponseDto,
} from './dto/waitlist-response.dto.js';
import {
  WaitlistStatsQueryDto,
  WaitlistStatsResponseDto,
} from './dto/waitlist-stats.dto.js';
import {
  WaitlistQrQueryDto,
  WaitlistQrSessionResponseDto,
  WaitlistQrTokenResponseDto,
} from './dto/waitlist-qr.dto.js';
import { WaitlistTicketPaginationQueryDto } from './dto/waitlist-ticket-pagination-query.dto.js';
import {
  UpdateWaitlistPausedDto,
  UpdateWaitlistSettingsDto,
  WaitlistSettingsResponseDto,
} from './dto/waitlist-settings.dto.js';
import {
  STAFF_TRANSITION_STATUSES,
  type StaffTransitionStatus,
} from './waitlist-rules.js';
import {
  setWaitlistQrSessionCookie,
  WAITLIST_QR_SESSION_COOKIE,
} from './waitlist-qr-token.js';
import { WaitlistService } from './waitlist.service.js';

@AllowAnonymous()
@ApiTags('waitlist')
@ApiExtraModels(WaitlistErrorResponseDto, WaitlistTicketListItemDto)
@Controller('organizations/:organizationSlug/waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  @ApiOperation({ summary: '候位狀態（公開）' })
  status(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<WaitlistStatusResponseDto> {
    return this.waitlistService.getPublicStatus(organizationSlug);
  }

  @Get('qr')
  @Redirect()
  @ApiOperation({
    summary:
      '掃描門市現場候位 QR code：簽章換成短效 cookie 後轉回不帶簽章的候位頁',
  })
  async scanQr(
    @Param('organizationSlug') organizationSlug: string,
    @Query() { token }: WaitlistQrQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const scanned = await this.waitlistService.scanQr(organizationSlug, token);
    if (scanned?.issued) setWaitlistQrSessionCookie(res, scanned.issued);

    // 用相對路徑：cookie 落在使用者掃到的網域，改轉 NEXT_URL 遇到 www／preview 等不同網域就帶不到 cookie
    return {
      statusCode: 303,
      url: `/waitlist/${encodeURIComponent(scanned?.slug || organizationSlug)}`,
    };
  }

  @Get('qr-session')
  @ApiOperation({ summary: '目前瀏覽器持有的門市現場取號資格' })
  findQrSession(
    @Param('organizationSlug') organizationSlug: string,
    @Req() req: Request,
  ): Promise<WaitlistQrSessionResponseDto> {
    return this.waitlistService.findQrSession(
      organizationSlug,
      req.cookies?.[WAITLIST_QR_SESSION_COOKIE],
    );
  }

  @Get('qr-token')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '產生門市現場候位 QR code 的簽章' })
  findQrToken(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<WaitlistQrTokenResponseDto> {
    return this.waitlistService.getQrToken(organizationSlug);
  }

  @Post('tickets')
  @ApiHeader({
    description: '同一次取號重試請帶同一把鍵，重送會回傳既有號碼牌',
    name: 'Idempotency-Key',
    required: false,
  })
  @ApiOperation({ summary: '取號（須先掃描門市現場候位 QR code）' })
  async createTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateWaitlistTicketDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @I18nLang() lang: string,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WaitlistTicketResponseDto> {
    const qrSessionValue: unknown = req.cookies?.[WAITLIST_QR_SESSION_COOKIE];
    const ticket = await this.waitlistService.createTicket(
      organizationSlug,
      dto,
      session?.user.id || null,
      toLanguage(lang),
      idempotencyKey || null,
      false,
      qrSessionValue,
    );

    const renewed = await this.waitlistService.renewQrSession(
      organizationSlug,
      qrSessionValue,
    );
    if (renewed) setWaitlistQrSessionCookie(res, renewed);

    return ticket;
  }

  @Post('tickets/admin')
  @Roles({ waitlist: ['update'] }, 'organizationSlug')
  @Audit('waitlistTicket', { response: true })
  @ApiHeader({
    description: '同一次登記重試請帶同一把鍵，重送會回傳既有號碼牌',
    name: 'Idempotency-Key',
    required: false,
  })
  @ApiOperation({
    summary: '店員代客登記候位',
    description: '不受暫停取號與營業時間限制',
  })
  createTicketByStaff(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateWaitlistTicketDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @I18nLang() lang: string,
  ): Promise<WaitlistTicketResponseDto> {
    return this.waitlistService.createTicket(
      organizationSlug,
      dto,
      null,
      toLanguage(lang),
      idempotencyKey || null,
      true,
    );
  }

  @Get('tickets')
  @Roles({ waitlist: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '後台候位清單（進行中＋今日已結束）' })
  listAdmin(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<AdminWaitlistResponseDto> {
    return this.waitlistService.listAdmin(organizationSlug);
  }

  @Get('tickets/list')
  @Roles({ waitlist: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '後台號碼牌歷史列表' })
  listTickets(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: WaitlistTicketPaginationQueryDto,
  ): Promise<{ data: WaitlistTicketListItemDto[]; total: number }> {
    return this.waitlistService.listTickets(organizationSlug, query);
  }

  @Get('stats')
  @Roles({ waitlist: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '候位統計' })
  stats(
    @Param('organizationSlug') organizationSlug: string,
    @Query() { since, until }: WaitlistStatsQueryDto,
  ): Promise<WaitlistStatsResponseDto> {
    return this.waitlistService.getStats(
      organizationSlug,
      new Date(since),
      until ? new Date(until) : undefined,
    );
  }

  @Get('tickets/:ticketId')
  @ApiOperation({ summary: '查詢號碼牌（公開）' })
  getTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Param('ticketId') ticketId: string,
  ): Promise<WaitlistTicketDetailResponseDto> {
    return this.waitlistService.getTicket(organizationSlug, ticketId);
  }

  @Post('tickets/:ticketId/cancel')
  @ApiOperation({ summary: '顧客取消候位' })
  cancelTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Param('ticketId') ticketId: string,
  ): Promise<WaitlistTicketResponseDto> {
    return this.waitlistService.cancelTicket(organizationSlug, ticketId);
  }

  @Post('tickets/:ticketId/confirm')
  @ApiOperation({ summary: '顧客回覆確認前往（僅限已叫號）' })
  confirmTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Param('ticketId') ticketId: string,
  ): Promise<WaitlistTicketResponseDto> {
    return this.waitlistService.confirmTicket(organizationSlug, ticketId);
  }

  @Patch('tickets/:ticketId')
  @Roles({ waitlist: ['update'] }, 'organizationSlug')
  @Audit('waitlistTicket', { param: 'ticketId' })
  @ApiOperation({
    summary: '修改號碼牌',
    description: '僅限進行中；人數換到其他分組時改發新組號碼並排到最後',
  })
  updateTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateWaitlistTicketDto,
  ): Promise<WaitlistTicketResponseDto> {
    return this.waitlistService.updateTicket(organizationSlug, ticketId, dto);
  }

  @Patch('tickets/:ticketId/transitions/:status')
  @Roles({ waitlist: ['update'] }, 'organizationSlug')
  @Audit('waitlistTicket', { param: 'ticketId' })
  @ApiOperation({
    summary: '叫號／入座／過號／取消',
    description: '已叫號可再次叫號；過號可補入座',
  })
  transitionTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Param('ticketId') ticketId: string,
    @Param('status', new ParseEnumPipe(STAFF_TRANSITION_STATUSES))
    status: StaffTransitionStatus,
  ): Promise<WaitlistTicketResponseDto> {
    return this.waitlistService.transitionTicket(
      organizationSlug,
      ticketId,
      status,
    );
  }

  @Put('paused')
  @Roles({ waitlist: ['update'] }, 'organizationSlug')
  @Audit({
    resource: 'organization',
    idSource: { column: 'organizationId', organization: true },
    via: { table: 'waitlistSetting', ownerColumn: 'organizationId' },
  })
  @ApiOperation({ summary: '暫停／恢復取號' })
  updatePaused(
    @Param('organizationSlug') organizationSlug: string,
    @Body() { paused }: UpdateWaitlistPausedDto,
  ): Promise<WaitlistSettingsResponseDto> {
    return this.waitlistService.updatePaused(organizationSlug, paused);
  }

  @Get('settings')
  @Roles({ waitlistSetting: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '候位設定' })
  settings(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<WaitlistSettingsResponseDto> {
    return this.waitlistService.getSettingsBySlug(organizationSlug);
  }

  @Put('settings')
  @Roles({ waitlistSetting: ['update'] }, 'organizationSlug')
  @Audit({
    resource: 'organization',
    idSource: { column: 'organizationId', organization: true },
    via: { table: 'waitlistSetting', ownerColumn: 'organizationId' },
  })
  @ApiOperation({ summary: '更新候位設定' })
  updateSettings(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: UpdateWaitlistSettingsDto,
  ): Promise<WaitlistSettingsResponseDto> {
    return this.waitlistService.updateSettings(organizationSlug, dto);
  }
}
