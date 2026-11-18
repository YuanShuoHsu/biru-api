import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from '../common/guards/admin.guard.js';

import {
  PointReportDetailResponseDto,
  PointReportQueryDto,
  PointReportResponseDto,
} from './dto/point-report.dto.js';
import { PointReportsService } from './point-reports.service.js';

@ApiTags('points')
@UseGuards(AdminGuard)
@Controller('point-reports')
export class AdminPointReportsController {
  constructor(private readonly pointReportsService: PointReportsService) {}

  @Get()
  @ApiOperation({ summary: '各發點門市當月的點數對帳' })
  @ApiOkResponse({ type: PointReportResponseDto })
  getReport(
    @Query() { month }: PointReportQueryDto,
  ): Promise<PointReportResponseDto> {
    return this.pointReportsService.getReport(month);
  }

  @Get(':organizationId')
  @ApiOperation({ summary: '一間門市當月與各門市之間的跨店點數使用明細' })
  @ApiOkResponse({ type: PointReportDetailResponseDto })
  getDetail(
    @Param('organizationId') organizationId: string,
    @Query() { month }: PointReportQueryDto,
  ): Promise<PointReportDetailResponseDto> {
    return this.pointReportsService.getDetail(organizationId, month);
  }
}
