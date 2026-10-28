import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiParam,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';
import type { AuthRequest } from '../menus/guards/roles.guard.js';

import { AuditService } from './audit.service.js';
import { AuditLogPaginationQueryDto } from './dto/audit-log-pagination-query.dto.js';
import { AuditLogListResponseDto } from './dto/audit-log-response.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
@ApiParam({ name: 'organizationSlug' })
@Controller('organizations/:organizationSlug/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles({ auditLog: ['read'] }, 'organizationSlug')
  @ApiOperation({
    summary:
      '查詢異動紀錄；帶 resource + resourceId 可取單一資源的歷史。出勤與薪資紀錄只列出具備該資料讀取權限者',
  })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  findAll(
    @Query() query: AuditLogPaginationQueryDto,
    @Req() req: AuthRequest,
  ): Promise<AuditLogListResponseDto> {
    return this.auditService.listForOrganization(
      req.organizationId!,
      req.memberRole!,
      query,
    );
  }
}
