import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminGuard } from '../common/guards/admin.guard.js';

import { AuditService } from './audit.service.js';
import { AuditLogPaginationQueryDto } from './dto/audit-log-pagination-query.dto.js';
import { AuditLogListResponseDto } from './dto/audit-log-response.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('audit-logs')
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: '查詢全平台異動紀錄（含所有店家與平台層的紀錄）' })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  findAll(
    @Query() query: AuditLogPaginationQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditService.listAll(query);
  }
}
