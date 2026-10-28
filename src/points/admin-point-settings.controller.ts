import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { POINT_SETTING_ID } from '../db/schema/points.js';

import { PointSettingResponseDto } from './dto/point-setting-response.dto.js';
import { UpdatePointSettingDto } from './dto/update-point-setting.dto.js';
import { PointSettingsService } from './point-settings.service.js';

@ApiTags('points')
@UseGuards(AdminGuard)
@Controller('point-settings')
export class AdminPointSettingsController {
  constructor(private readonly pointSettingsService: PointSettingsService) {}

  @Get()
  @ApiOperation({ summary: '全品牌的點數規則' })
  @ApiOkResponse({ type: PointSettingResponseDto })
  get(): Promise<PointSettingResponseDto> {
    return this.pointSettingsService.get();
  }

  @Patch()
  @Audit('pointSetting', { id: POINT_SETTING_ID })
  @ApiOperation({
    summary:
      '修改全品牌的點數規則；每點金額設為有值時自動記下啟用時間，設為 null 時停用並清空有效年限',
  })
  @ApiOkResponse({ type: PointSettingResponseDto })
  update(@Body() dto: UpdatePointSettingDto): Promise<PointSettingResponseDto> {
    return this.pointSettingsService.update(dto);
  }
}
