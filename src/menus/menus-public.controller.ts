import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { OrderMenuResponseDto } from './dto/order-menu-response.dto';
import { PublicMenusService } from './menus-public.service';

import { languageEnum, type Language } from 'src/db/schema/menus';

@ApiTags('public')
@Controller('organizations/:organizationId')
export class PublicMenusController {
  constructor(private readonly publicMenusService: PublicMenusService) {}

  @Get('order-menu')
  @ApiOperation({ summary: '取得點餐菜單' })
  @ApiQuery({ name: 'lang', enum: languageEnum.enumValues })
  findOrderMenu(
    @Param('organizationId') organizationId: string,
    @Query('lang') lang: Language,
  ): Promise<OrderMenuResponseDto[]> {
    return this.publicMenusService.findOrderMenu(organizationId, lang);
  }
}
