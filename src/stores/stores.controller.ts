import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { Public } from 'src/auth/decorators/public.decorator';

import { ReadStoreDto } from './dto/read-store.dto';
import { StoresService } from './stores.service';

@Controller('stores')
@Public()
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  // @Post()
  // create(@Body() createStoreDto: CreateStoreDto) {
  //   return this.storesService.create(createStoreDto);
  // }

  @Get()
  @ApiOperation({ summary: '查詢所有門市' })
  findAll(): Promise<ReadStoreDto[]> {
    return this.storesService.findAll();
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
