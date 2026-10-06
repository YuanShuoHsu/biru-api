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

import { I18nLang } from 'nestjs-i18n';
import {
  DEFAULT_LANGUAGE,
  languagesEnum,
  type Language,
} from 'src/db/schema/enums';
import { Roles } from 'src/menus/decorators/roles.decorator';

import { CreateWaitlistTicketDto } from './dto/create-waitlist-ticket.dto';
import {
  AdminWaitlistResponseDto,
  WaitlistErrorResponseDto,
  WaitlistStatusResponseDto,
  WaitlistTicketResponseDto,
} from './dto/waitlist-response.dto';
import {
  UpdateWaitlistPausedDto,
  UpdateWaitlistSettingsDto,
  WaitlistSettingsResponseDto,
} from './dto/waitlist-settings.dto';
import {
  STAFF_TRANSITION_STATUSES,
  type StaffTransitionStatus,
} from './waitlist-rules';
import { WaitlistService } from './waitlist.service';

const toLanguage = (lang: string): Language =>
  languagesEnum.enumValues.find((value) => value === lang) || DEFAULT_LANGUAGE;

@AllowAnonymous()
@ApiTags('waitlist')
@ApiExtraModels(WaitlistErrorResponseDto)
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

  @Post('tickets')
  @ApiHeader({
    description: '同一次取號重試請帶同一把鍵，重送會回傳既有號碼牌',
    name: 'Idempotency-Key',
    required: false,
  })
  @ApiOperation({ summary: '取號' })
  createTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateWaitlistTicketDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @I18nLang() lang: string,
    @Session() session: UserSession | null,
  ): Promise<WaitlistTicketResponseDto> {
    return this.waitlistService.createTicket(
      organizationSlug,
      dto,
      session?.user.id || null,
      toLanguage(lang),
      idempotencyKey || null,
      false,
    );
  }

  @Post('tickets/admin')
  @Roles({ waitlist: ['update'] }, 'organizationSlug')
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

  @Get('tickets/:ticketId')
  @ApiOperation({ summary: '查詢號碼牌（公開）' })
  getTicket(
    @Param('organizationSlug') organizationSlug: string,
    @Param('ticketId') ticketId: string,
  ): Promise<WaitlistTicketResponseDto> {
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

  @Patch('tickets/:ticketId/transitions/:status')
  @Roles({ waitlist: ['update'] }, 'organizationSlug')
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
  @ApiOperation({ summary: '更新候位設定' })
  updateSettings(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: UpdateWaitlistSettingsDto,
  ): Promise<WaitlistSettingsResponseDto> {
    return this.waitlistService.updateSettings(organizationSlug, dto);
  }
}
