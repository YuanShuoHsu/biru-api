import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  Audit,
  type AuditTarget,
} from '../common/decorators/audit.decorator.js';
import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import {
  OrganizationMember,
  Roles,
} from '../menus/decorators/roles.decorator.js';
import { ReorderDto } from '../menus/dto/reorder.dto.js';

import { ChecklistTemplatesService } from './checklist-templates.service.js';
import {
  ChecklistTemplateDto,
  CreateChecklistTemplateDto,
  UpdateChecklistTemplateDto,
} from './dto/checklist-template.dto.js';

const itemsAudit = (idSource: AuditTarget['idSource']): AuditTarget => ({
  resource: 'checklistTemplate',
  idSource,
  via: { table: 'checklistTemplateItem', ownerColumn: 'templateId' },
});

@ApiTags('checklists')
@Controller('organizations/:organizationSlug/checklists/templates')
export class ChecklistTemplatesController {
  constructor(private readonly templatesService: ChecklistTemplatesService) {}

  @Get()
  @OrganizationMember('organizationSlug')
  @ApiOkResponse({ isArray: true, type: ChecklistTemplateDto })
  @ApiOperation({ summary: '列出例行檢查表範本與項目' })
  findAll(
    @OrganizationId() organizationId: string,
  ): Promise<ChecklistTemplateDto[]> {
    return this.templatesService.findAll(organizationId);
  }

  @Post()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(
    { resource: 'checklistTemplate', idSource: { response: true } },
    itemsAudit({ column: 'templateId', response: true }),
  )
  @ApiCreatedResponse({ type: ChecklistTemplateDto })
  @ApiOperation({ summary: '新增例行檢查表範本' })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateChecklistTemplateDto,
  ): Promise<ChecklistTemplateDto> {
    return this.templatesService.create(organizationId, dto);
  }

  @Patch('reorder')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit('checklistTemplate', { body: 'ids' })
  @ApiOperation({ summary: '重新排序例行檢查表範本' })
  reorder(
    @OrganizationId() organizationId: string,
    @Body() { ids }: ReorderDto,
  ): Promise<void> {
    return this.templatesService.reorder(organizationId, ids);
  }

  @Patch(':templateId')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(
    { resource: 'checklistTemplate', idSource: { param: 'templateId' } },
    itemsAudit({ column: 'templateId', param: 'templateId' }),
  )
  @ApiOkResponse({ type: ChecklistTemplateDto })
  @ApiOperation({ summary: '更新例行檢查表範本；帶 items 時整組替換項目' })
  update(
    @OrganizationId() organizationId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateChecklistTemplateDto,
  ): Promise<ChecklistTemplateDto> {
    return this.templatesService.update(organizationId, templateId, dto);
  }

  @Delete(':templateId')
  @HttpCode(204)
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit('checklistTemplate', { param: 'templateId' })
  @ApiNoContentResponse()
  @ApiOperation({ summary: '刪除例行檢查表範本（既有的執行紀錄保留快照）' })
  remove(
    @OrganizationId() organizationId: string,
    @Param('templateId') templateId: string,
  ): Promise<void> {
    return this.templatesService.remove(organizationId, templateId);
  }
}
