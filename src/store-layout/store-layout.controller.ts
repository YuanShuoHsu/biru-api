import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { OrganizationMember } from '../menus/decorators/roles.decorator.js';

import {
  StoreLayoutResponseDto,
  UpdateStoreLayoutDto,
} from './dto/store-layout.dto.js';
import { StoreLayoutService } from './store-layout.service.js';

@ApiTags('store-layout')
@UseGuards(AdminGuard)
@Controller('organizations/:organizationSlug/store-layout')
export class StoreLayoutController {
  constructor(private readonly storeLayoutService: StoreLayoutService) {}

  @Get()
  @ApiOperation({ summary: '門市平面圖；尚未建立時回 404' })
  @ApiOkResponse({ type: StoreLayoutResponseDto })
  get(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<StoreLayoutResponseDto> {
    return this.storeLayoutService.get(organizationSlug);
  }

  @Put()
  @OrganizationMember('organizationSlug')
  @Audit({
    resource: 'organization',
    idSource: { column: 'organizationId', organization: true },
    via: { table: 'storeLayout', ownerColumn: 'organizationId' },
  })
  @ApiOperation({ summary: '建立或整份取代門市平面圖' })
  @ApiOkResponse({ type: StoreLayoutResponseDto })
  update(
    @Param('organizationSlug') organizationSlug: string,
    @Body() { data }: UpdateStoreLayoutDto,
  ): Promise<StoreLayoutResponseDto> {
    return this.storeLayoutService.update(organizationSlug, data);
  }
}
