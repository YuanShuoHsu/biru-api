import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ReadMenuDto } from './dto/read-menu.dto';
import { StoresService } from './stores.service';

@ApiTags('Admin/Stores')
@Controller('admin/stores')
export class AdminStoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get(':id/menus')
  @ApiOperation({ summary: '管理員查詢店家菜單 (包含停用項目)' })
  findAllMenus(@Param('id') id: string): Promise<ReadMenuDto[]> {
    return this.storesService.menus({
      id,
    });
  }
}
