import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { ReadMenuDto } from './dto/read-menu.dto';
import { ReadStoreDto } from './dto/read-store.dto';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @ApiOperation({ summary: '查詢所有門市' })
  findAll(): Promise<ReadStoreDto[]> {
    return this.storesService.stores({});
  }

  @Get(':id/menus')
  @ApiOperation({ summary: '查詢店家菜單' })
  findAllMenus(@Param('id') id: string): Promise<ReadMenuDto[]> {
    return this.storesService.menus({
      id,
      isActive: true,
    });
  }
}
