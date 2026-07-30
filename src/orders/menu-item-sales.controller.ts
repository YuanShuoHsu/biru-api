import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from 'src/menus/decorators/roles.decorator';

import {
  MenuItemSalesQueryDto,
  MenuItemSalesResponseDto,
} from './dto/menu-item-sales.dto';
import {
  MenuItemSalesService,
  SALES_WINDOW_DAYS,
  getSalesWindowStart,
} from './menu-item-sales.service';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/menu-item-sales')
export class MenuItemSalesController {
  constructor(private readonly menuItemSalesService: MenuItemSalesService) {}

  @Get()
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢品項銷量' })
  @ApiOkResponse({ type: [MenuItemSalesResponseDto] })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: MenuItemSalesQueryDto,
  ): Promise<MenuItemSalesResponseDto[]> {
    return this.menuItemSalesService.getSalesBySlug(
      organizationSlug,
      query.since
        ? new Date(query.since)
        : getSalesWindowStart(SALES_WINDOW_DAYS),
    );
  }
}
