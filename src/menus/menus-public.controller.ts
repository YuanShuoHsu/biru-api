import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { OrderMenuSectionResponseDto } from './dto/order-menu-response.dto';
import { PublicMenusService } from './menus-public.service';

@ApiTags('public')
@Controller('organizations/:organizationId')
export class PublicMenusController {
  constructor(private readonly publicMenusService: PublicMenusService) {}

  @Get('order-menu')
  @ApiOperation({ summary: '取得點餐菜單' })
  findOrderMenu(
    @Param('organizationId') organizationId: string,
    @Query('lang') lang: string,
  ): Promise<OrderMenuSectionResponseDto[]> {
    return this.publicMenusService.findOrderMenu(organizationId, lang);
  }
}
