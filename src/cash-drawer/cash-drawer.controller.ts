import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { CashDrawerService } from './cash-drawer.service.js';
import { CashDrawerSessionQueryDto } from './dto/cash-drawer-session-query.dto.js';
import {
  CashDrawerSessionDto,
  CashDrawerSessionListResponseDto,
  CloseCashDrawerDto,
  CreateCashDrawerMovementDto,
  CurrentCashDrawerDto,
  OpenCashDrawerDto,
} from './dto/cash-drawer.dto.js';

@ApiTags('cash-drawer')
@Controller('organizations/:organizationSlug/cash-drawer')
export class CashDrawerController {
  constructor(private readonly cashDrawerService: CashDrawerService) {}

  @Get('current')
  @Roles({ cashDrawer: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '目前開帳中的錢櫃與即時應有現金' })
  @ApiOkResponse({ type: CurrentCashDrawerDto })
  getCurrent(
    @OrganizationId() organizationId: string,
  ): Promise<CurrentCashDrawerDto> {
    return this.cashDrawerService.getCurrent(organizationId);
  }

  @Get('sessions')
  @Roles({ cashDrawer: ['read'], revenue: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '錢櫃開關帳紀錄' })
  @ApiOkResponse({ type: CashDrawerSessionListResponseDto })
  list(
    @OrganizationId() organizationId: string,
    @Query() query: CashDrawerSessionQueryDto,
  ): Promise<CashDrawerSessionListResponseDto> {
    return this.cashDrawerService.list(organizationId, query);
  }

  @Post('sessions')
  @Roles({ cashDrawer: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '開帳' })
  @ApiCreatedResponse({ type: CashDrawerSessionDto })
  open(
    @OrganizationId() organizationId: string,
    @Body() dto: OpenCashDrawerDto,
    @Session() session: UserSession,
  ): Promise<CashDrawerSessionDto> {
    return this.cashDrawerService.open(organizationId, dto, session.user.id);
  }

  @Post('sessions/:sessionId/movements')
  @Roles({ cashDrawer: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '存入或提出現金' })
  @ApiCreatedResponse({ type: CashDrawerSessionDto })
  addMovement(
    @OrganizationId() organizationId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateCashDrawerMovementDto,
    @Session() session: UserSession,
  ): Promise<CashDrawerSessionDto> {
    return this.cashDrawerService.addMovement(
      organizationId,
      sessionId,
      dto,
      session.user.id,
    );
  }

  @Post('sessions/:sessionId/close')
  @Roles({ cashDrawer: ['create'] }, 'organizationSlug')
  @ApiOperation({
    summary: '關帳：寫入應有現金快照，差額超過門檻時必須填寫說明',
  })
  @ApiCreatedResponse({ type: CashDrawerSessionDto })
  close(
    @OrganizationId() organizationId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: CloseCashDrawerDto,
    @Session() session: UserSession,
  ): Promise<CashDrawerSessionDto> {
    return this.cashDrawerService.close(
      organizationId,
      sessionId,
      dto,
      session.user.id,
    );
  }
}
