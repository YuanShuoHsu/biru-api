import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { languagesEnum, type Language } from '../db/schema/enums.js';

import { PublicStorePhotoResponseDto } from './dto/public-store-photo-response.dto.js';
import { StorePhotosService } from './store-photos.service.js';

@ApiTags('store-photos')
@Controller('store-photos')
export class StorePhotosController {
  constructor(private readonly storePhotosService: StorePhotosService) {}

  @Get('active')
  @AllowAnonymous()
  @ApiOperation({ summary: '取得前台門市照片' })
  @ApiQuery({ name: 'lang', enum: languagesEnum.enumValues })
  findAllActive(
    @Query('lang') lang: Language,
  ): Promise<PublicStorePhotoResponseDto[]> {
    return this.storePhotosService.findAllActive(lang);
  }
}
