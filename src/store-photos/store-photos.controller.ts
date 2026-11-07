import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { I18nLang } from 'nestjs-i18n';

import { toLanguage } from '../common/utils/language.js';
import { languagesEnum } from '../db/schema/enums.js';

import { PublicStorePhotoResponseDto } from './dto/public-store-photo-response.dto.js';
import { StorePhotosService } from './store-photos.service.js';

@ApiTags('store-photos')
@Controller('store-photos')
export class StorePhotosController {
  constructor(private readonly storePhotosService: StorePhotosService) {}

  @Get('active')
  @AllowAnonymous()
  @ApiOperation({ summary: '取得前台門市照片' })
  @ApiQuery({
    name: 'lang',
    enum: languagesEnum.enumValues,
    required: false,
    description: '未帶或不支援時依 x-lang、Accept-Language',
  })
  findAllActive(
    @I18nLang() lang: string,
  ): Promise<PublicStorePhotoResponseDto[]> {
    return this.storePhotosService.findAllActive(toLanguage(lang));
  }
}
