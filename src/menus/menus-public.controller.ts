import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { OrderMenuSectionResponseDto } from './dto/order-menu-response.dto';
import { PublicMenusService } from './menus-public.service';

@AllowAnonymous()
@ApiTags('menus')
@Controller()
export class PublicMenusController {
  constructor(private readonly publicMenusService: PublicMenusService) {}

  @Get('organizations/:slug/order-menu')
  @ApiOperation({ summary: '取得點餐用菜單（公開）' })
  @ApiResponse({ type: [OrderMenuSectionResponseDto] })
  getOrderMenu(
    @Param('slug') slug: string,
    @Query('lang') lang: string,
  ): Promise<OrderMenuSectionResponseDto[]> {
    return this.publicMenusService.getOrderMenu(slug, lang);
  }
}
