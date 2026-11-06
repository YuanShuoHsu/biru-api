import { Controller, Get, NotFoundException, Param } from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { I18nContext, I18nService } from 'nestjs-i18n';

import {
  ANONYMOUS_THROTTLER,
  HOURLY_THROTTLER,
} from '../common/constants/throttle.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { BusinessInfoResponseDto } from './dto/business-info-response.dto.js';
import { BusinessNoParamDto } from './dto/business-no-param.dto.js';
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
  @Throttle({
    [ANONYMOUS_THROTTLER]: { limit: 30, ttl: minutes(1) },
    [HOURLY_THROTTLER]: { limit: 150, ttl: hours(1) },
  })
  @ApiOperation({
    summary: '依統一編號查詢公司或商業登記的名稱、地址與負責人',
  })
  // https://docs.nestjs.com/openapi/operations#responses
  @ApiOkResponse({ type: BusinessInfoResponseDto })
  @ApiBadRequestResponse({ description: '統一編號格式或檢查碼不符' })
  @ApiNotFoundResponse({
    description: '查無公司或商業登記，需手動填寫名稱與地址',
  })
  @ApiServiceUnavailableResponse({
    description: '商工登記查詢服務暫時無法使用',
  })
  async findOne(
    @Param() { businessNo }: BusinessNoParamDto,
  ): Promise<BusinessInfoResponseDto> {
    const result = await this.gcisService.findByBusinessNo(businessNo);
    if (!result)
      throw new NotFoundException({
        error: 'Not Found',
        code: 'companyNotFound',
        message: this.i18n.t('common.gcis.companyNotFound', {
          lang: I18nContext.current()?.lang,
        }),
      });

    return result;
  }
}
