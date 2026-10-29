import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { PublicPointSettingResponseDto } from './dto/point-setting-response.dto.js';
import { PointSettingsService } from './point-settings.service.js';

@ApiTags('points')
@Controller('point-settings')
export class PointSettingsController {
  constructor(private readonly pointSettingsService: PointSettingsService) {}

  @Get('public')
  @AllowAnonymous()
  @ApiOperation({ summary: '前台顯示集點規則用的全品牌點數設定（公開）' })
  @ApiOkResponse({ type: PublicPointSettingResponseDto })
  getPublic(): Promise<PublicPointSettingResponseDto> {
    return this.pointSettingsService.getPublic();
  }
}
