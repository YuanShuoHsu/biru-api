import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { AuditService } from './audit.service';
import { AuditLogPaginationQueryDto } from './dto/audit-log-pagination-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';

@ApiTags('audit')
@ApiBearerAuth()
@ApiExtraModels(AuditLogResponseDto)
@UseGuards(AdminGuard)
@Controller('audit-logs')
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: '查詢全平台異動紀錄（含所有店家與平台層的紀錄）' })
  findAll(
    @Query() query: AuditLogPaginationQueryDto,
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    return this.auditService.listAll(query);
  }
}
