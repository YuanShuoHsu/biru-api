import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { ReadMenuDto } from 'src/menus/dto/read-menu.dto';
import { MenusService } from 'src/menus/menus.service';

import { ReadStoreDto } from './dto/read-store.dto';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(
    private readonly menusService: MenusService,
    private readonly storesService: StoresService,
  ) {}

  // @Post()
  // create(@Body() createStoreDto: CreateStoreDto) {
  //   return this.storesService.create(createStoreDto);
  // }

  @Get()
  @ApiOperation({ summary: '查詢所有門市' })
  findAll(): Promise<ReadStoreDto[]> {
    return this.storesService.stores({});
  }

  @Get(':id/menus')
  @ApiOperation({ summary: '查詢店家菜單' })
  findMenus(@Param('id') id: string): Promise<ReadMenuDto[]> {
    return this.menusService.findAll(id);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.storesService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
  //   return this.storesService.update(+id, updateStoreDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.storesService.remove(+id);
  // }
}
