import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';

import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { I18nContext, I18nService } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

import type { BusinessInfo } from './gcis.service.js';
import { GcisService } from './gcis.service.js';

@AllowAnonymous()
@ApiTags('gcis')
@Controller('gcis')
export class GcisController {
  constructor(
    private readonly gcisService: GcisService,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  @Get(':businessNo')
  @ApiOperation({ summary: '依統一編號查詢公司名稱、地址與負責人' })
  @ApiParam({ name: 'businessNo', description: '統一編號（8位數字）' })
  async findOne(
    @Param('businessNo') businessNo: string,
  ): Promise<BusinessInfo> {
    if (!/^\d{8}$/.test(businessNo))
      throw new BadRequestException(
        this.i18n.t('common.gcis.invalidBusinessNo', {
          lang: I18nContext.current()?.lang,
        }),
      );

    const result = await this.gcisService.findByBusinessNo(businessNo);
    if (!result) throw new NotFoundException('找不到對應的公司資料');

    return result;
  }
}
