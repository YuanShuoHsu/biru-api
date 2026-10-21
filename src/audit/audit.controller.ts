import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiParam,
  ApiExtraModels,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';
import type { AuthRequest } from '../menus/guards/roles.guard.js';

import { AuditService } from './audit.service.js';
import { AuditLogPaginationQueryDto } from './dto/audit-log-pagination-query.dto.js';
import { AuditLogResponseDto } from './dto/audit-log-response.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
// 唯一端點回傳 { data, total } 這種 inline 型別，swagger 推導不到其中的 DTO
@ApiExtraModels(AuditLogResponseDto)
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
  findAll(
    @Query() query: AuditLogPaginationQueryDto,
    @Req() req: AuthRequest,
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    return this.auditService.listForOrganization(
      req.organizationId!,
      req.memberRole!,
      query,
    );
  }
}
