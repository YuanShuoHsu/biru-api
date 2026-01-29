import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { ReadMenuDto } from './dto/read-menu.dto';
import { ReadStoreDto } from './dto/read-store.dto';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({ summary: '查詢所有門市' })
  findAll(): Promise<ReadStoreDto[]> {
    return this.storesService.stores({});
  }

  @AllowAnonymous()
  @Get(':id/menus')
  @ApiOperation({ summary: '查詢店家菜單' })
  findAllMenus(@Param('id') id: string): Promise<ReadMenuDto[]> {
    return this.storesService.menus({
      id,
      isActive: true,
    });
  }
}
