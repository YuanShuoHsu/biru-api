import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { OrderMenuResponseDto } from './dto/order-menu-response.dto.js';
import { PublicMenusService } from './menus-public.service.js';

import { languagesEnum, type Language } from '../db/schema/enums.js';

@AllowAnonymous()
@ApiTags('public')
@Controller('organizations/:organizationId')
export class PublicMenusController {
  constructor(private readonly publicMenusService: PublicMenusService) {}

  @Get('order-menu')
  @ApiOperation({ summary: '取得點餐菜單' })
  @ApiOkResponse({ type: OrderMenuResponseDto, description: '無菜單時為 null' })
  @ApiQuery({ name: 'lang', enum: languagesEnum.enumValues })
  findOrderMenu(
    @Param('organizationId') organizationId: string,
    @Query('lang') lang: Language,
  ): Promise<OrderMenuResponseDto | null> {
    return this.publicMenusService.findOrderMenu(organizationId, lang);
  }
}
