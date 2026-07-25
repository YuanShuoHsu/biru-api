import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { BannersService } from './banners.service';
import { BannerResponseDto } from './dto/banner-response.dto';

@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get('active')
  @AllowAnonymous()
  @ApiOperation({ summary: '取得前台輪播圖' })
  findAllActive(): Promise<BannerResponseDto[]> {
    return this.bannersService.findAllActive();
  }
}
