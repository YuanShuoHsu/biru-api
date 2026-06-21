import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import type { BusinessInfo } from './gcis.service';
import { GcisService } from './gcis.service';

@AllowAnonymous()
@ApiTags('gcis')
@Controller('gcis')
export class GcisController {
  constructor(private readonly gcisService: GcisService) {}

  @Get(':businessNo')
  @ApiOperation({ summary: '依統一編號查詢公司名稱與地址' })
  @ApiParam({ name: 'businessNo', description: '統一編號（8位數字）' })
  async findOne(
    @Param('businessNo') businessNo: string,
  ): Promise<BusinessInfo> {
    if (!/^\d{8}$/.test(businessNo))
      throw new BadRequestException('統一編號格式錯誤，需為 8 位數字');

    const result = await this.gcisService.findByBusinessNo(businessNo);
    if (!result) throw new NotFoundException('找不到對應的公司資料');

    return result;
  }
}
