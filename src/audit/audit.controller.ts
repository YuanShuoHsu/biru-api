import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from 'src/menus/decorators/roles.decorator';

import { AuditService } from './audit.service';
import { AuditLogPaginationQueryDto } from './dto/audit-log-pagination-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';

@ApiTags('audit')
@ApiBearerAuth()
// 唯一端點回傳 { data, total } 這種 inline 型別，swagger 推導不到其中的 DTO
@ApiExtraModels(AuditLogResponseDto)
@Controller('organizations/:organizationSlug/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles({ auditLog: ['read'] }, 'organizationSlug')
  @ApiOperation({
    summary: '查詢異動紀錄；帶 resource + resourceId 可取單一資源的歷史',
  })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: AuditLogPaginationQueryDto,
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    return this.auditService.listForOrganization(organizationSlug, query);
  }
}
