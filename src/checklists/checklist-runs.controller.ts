import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { OrganizationMember } from '../menus/decorators/roles.decorator.js';

import { ChecklistRunsService } from './checklist-runs.service.js';
import {
  ChecklistRunDto,
  ChecklistRunListResponseDto,
  ChecklistRunQueryDto,
  FillChecklistItemDto,
} from './dto/checklist-run.dto.js';

@ApiTags('checklists')
@Controller('organizations/:organizationSlug/checklists')
export class ChecklistRunsController {
  constructor(private readonly runsService: ChecklistRunsService) {}

  @Get('today')
  @OrganizationMember('organizationSlug')
  @ApiOkResponse({ isArray: true, type: ChecklistRunDto })
  @ApiOperation({
    summary: '今天各啟用範本的檢查表與完成狀況；門市第一次讀取時建立預設範本',
  })
  today(@OrganizationId() organizationId: string): Promise<ChecklistRunDto[]> {
    return this.runsService.today(organizationId);
  }

  @Put('today/:templateId/items/:itemId')
  @OrganizationMember('organizationSlug')
  @ApiOkResponse({ type: ChecklistRunDto })
  @ApiOperation({
    summary: '填寫今天檢查表的一個項目；第一次填寫時以範本現況建立當日紀錄',
  })
  fill(
    @OrganizationId() organizationId: string,
    @Param('templateId') templateId: string,
    @Param('itemId') itemId: string,
    @Body() dto: FillChecklistItemDto,
    @Session() { user }: UserSession,
  ): Promise<ChecklistRunDto> {
    return this.runsService.fill(organizationId, templateId, itemId, dto, user);
  }

  @Get('runs')
  @OrganizationMember('organizationSlug')
  @ApiOkResponse({ type: ChecklistRunListResponseDto })
  @ApiOperation({ summary: '檢查表歷史紀錄，依營業日新到舊' })
  findRuns(
    @OrganizationId() organizationId: string,
    @Query() query: ChecklistRunQueryDto,
  ): Promise<ChecklistRunListResponseDto> {
    return this.runsService.findRuns(organizationId, query);
  }
}
