import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { I18nLang } from 'nestjs-i18n';

import { OrderMenuResponseDto } from './dto/order-menu-response.dto.js';
import { PublicMenusService } from './menus-public.service.js';

import { toLanguage } from '../common/utils/language.js';
import { languagesEnum } from '../db/schema/enums.js';

@AllowAnonymous()
@ApiTags('public')
@Controller('organizations/:organizationId')
export class PublicMenusController {
  constructor(private readonly publicMenusService: PublicMenusService) {}

  @Get('order-menu')
  @ApiOperation({ summary: '取得點餐菜單' })
  @ApiOkResponse({ type: OrderMenuResponseDto, description: '無菜單時為 null' })
  @ApiQuery({
    name: 'lang',
    enum: languagesEnum.enumValues,
    required: false,
    description: '未帶或不支援時依 x-lang、Accept-Language',
  })
  findOrderMenu(
    @Param('organizationId') organizationId: string,
    @I18nLang() lang: string,
  ): Promise<OrderMenuResponseDto | null> {
    return this.publicMenusService.findOrderMenu(
      organizationId,
      toLanguage(lang),
    );
  }
}
