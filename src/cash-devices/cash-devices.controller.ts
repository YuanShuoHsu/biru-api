import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import {
  Audit,
  type AuditTarget,
} from '../common/decorators/audit.decorator.js';
import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { CashDevicesService } from './cash-devices.service.js';
import {
  CashDeviceEventListResponseDto,
  CashDeviceEventQueryDto,
  CashDeviceEventResponseDto,
  CreateCashDeviceCollectionDto,
  CreateCashDeviceRefillDto,
} from './dto/cash-device-event.dto.js';
import { CashDevicePaginationQueryDto } from './dto/cash-device-pagination-query.dto.js';
import {
  CashDeviceListResponseDto,
  CashDeviceResponseDto,
  CreateCashDeviceDto,
  UpdateCashDeviceDto,
} from './dto/cash-device.dto.js';

const eventAudit: AuditTarget = {
  resource: 'cashDevice',
  idSource: { column: 'idempotencyKey', body: 'idempotencyKey' },
  via: { table: 'cashDeviceEvent', ownerColumn: 'deviceId' },
};

@ApiTags('cash-devices')
@Controller('organizations/:organizationSlug/cash-devices')
export class CashDevicesController {
  constructor(private readonly cashDevicesService: CashDevicesService) {}

  @Get()
  @Roles({ cashDevice: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: CashDeviceListResponseDto })
  @ApiOperation({ summary: '查詢現金機台列表' })
  findAll(
    @OrganizationId() organizationId: string,
    @Query() query: CashDevicePaginationQueryDto,
  ): Promise<CashDeviceListResponseDto> {
    return this.cashDevicesService.findAll(organizationId, query);
  }

  @Get(':cashDeviceId')
  @Roles({ cashDevice: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: CashDeviceResponseDto })
  @ApiOperation({ summary: '查詢現金機台' })
  findOne(
    @OrganizationId() organizationId: string,
    @Param('cashDeviceId') cashDeviceId: string,
  ): Promise<CashDeviceResponseDto> {
    return this.cashDevicesService.findOne(organizationId, cashDeviceId);
  }

  @Post()
  @Roles({ cashDevice: ['create'] }, 'organizationSlug')
  @Audit('cashDevice', { response: true })
  @ApiCreatedResponse({ type: CashDeviceResponseDto })
  @ApiOperation({ summary: '新增現金機台' })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateCashDeviceDto,
  ): Promise<CashDeviceResponseDto> {
    return this.cashDevicesService.create(organizationId, dto);
  }

  @Patch(':cashDeviceId')
  @Roles({ cashDevice: ['update'] }, 'organizationSlug')
  @Audit('cashDevice', { param: 'cashDeviceId' })
  @ApiOkResponse({ type: CashDeviceResponseDto })
  @ApiOperation({ summary: '更新現金機台' })
  update(
    @OrganizationId() organizationId: string,
    @Param('cashDeviceId') cashDeviceId: string,
    @Body() dto: UpdateCashDeviceDto,
  ): Promise<CashDeviceResponseDto> {
    return this.cashDevicesService.update(organizationId, cashDeviceId, dto);
  }

  @Delete(':cashDeviceId')
  @HttpCode(204)
  @Roles({ cashDevice: ['delete'] }, 'organizationSlug')
  @Audit('cashDevice', { param: 'cashDeviceId' })
  @ApiNoContentResponse()
  @ApiOperation({ summary: '刪除現金機台；已有交易紀錄的機台不能刪除' })
  remove(
    @OrganizationId() organizationId: string,
    @Param('cashDeviceId') cashDeviceId: string,
  ): Promise<void> {
    return this.cashDevicesService.remove(organizationId, cashDeviceId);
  }

  @Get(':cashDeviceId/events')
  @Roles({ cashDevice: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: CashDeviceEventListResponseDto })
  @ApiOperation({ summary: '查詢現金機台的補幣、收鈔等紀錄，新的在前' })
  findEvents(
    @OrganizationId() organizationId: string,
    @Param('cashDeviceId') cashDeviceId: string,
    @Query() query: CashDeviceEventQueryDto,
  ): Promise<CashDeviceEventListResponseDto> {
    return this.cashDevicesService.findEvents(
      organizationId,
      cashDeviceId,
      query,
    );
  }

  @Post(':cashDeviceId/refills')
  @Roles({ cashDevice: ['refill'] }, 'organizationSlug')
  @Audit(eventAudit)
  @ApiCreatedResponse({ type: CashDeviceEventResponseDto })
  @ApiOperation({
    summary: '記錄現金機台補幣；同一把 idempotencyKey 重送回傳原紀錄',
  })
  refill(
    @OrganizationId() organizationId: string,
    @Param('cashDeviceId') cashDeviceId: string,
    @Session() session: UserSession,
    @Body() dto: CreateCashDeviceRefillDto,
  ): Promise<CashDeviceEventResponseDto> {
    return this.cashDevicesService.refill(
      organizationId,
      cashDeviceId,
      session.user.id,
      dto,
    );
  }

  @Post(':cashDeviceId/collections')
  @Roles({ cashDevice: ['collection'] }, 'organizationSlug')
  @Audit(eventAudit)
  @ApiCreatedResponse({ type: CashDeviceEventResponseDto })
  @ApiOperation({
    summary: '記錄現金機台收鈔；同一把 idempotencyKey 重送回傳原紀錄',
  })
  collect(
    @OrganizationId() organizationId: string,
    @Param('cashDeviceId') cashDeviceId: string,
    @Session() session: UserSession,
    @Body() dto: CreateCashDeviceCollectionDto,
  ): Promise<CashDeviceEventResponseDto> {
    return this.cashDevicesService.collect(
      organizationId,
      cashDeviceId,
      session.user.id,
      dto,
    );
  }
}
